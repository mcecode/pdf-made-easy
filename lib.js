import fs from "node:fs/promises";
import os from "node:os";
import nodePath from "node:path";
import nodeUrl from "node:url";

import watcher from "@parcel/watcher";
import { findUp, pathExists } from "find-up";
import { Liquid } from "liquidjs";
import puppeteer from "puppeteer";
import YAML from "yaml";

/**
 * @typedef {import("liquidjs").Liquid["parseAndRender"]} RenderLiquid
 * @typedef {import("yargs").Argv} Argv
 *
 * @typedef {import("./types.d.ts").Builder} Builder
 * @typedef {import("./types.d.ts").BuildOptions} BuildOptions
 * @typedef {import("./types.d.ts").CLIOptions} CLIOptions
 * @typedef {import("./types.d.ts").PDFRenderer} PDFRenderer
 */

/**
 * These are the downstream error messages thrown due to the `fs.readFile` in
 * `getData` sometimes returning an empty string when used together with
 * `@parcel/watcher`. They are disregarded for now until a better solution can
 * be made.
 */
const errorsToDisregard = [
  "'data' must be an object or undefined, given 'null'"
];

/**
 * Instantiates resources needed for PDF generation, then watches data and
 * template files for changes and outputs a PDF file on change.
 *
 * @param {BuildOptions} args
 * @param {string} rootDir
 *   Defaults to `process.cwd()`. The directory watched for changes to trigger
 *   re-emmiting the PDF file on change. Prepended to the relative paths passed
 *   to `args` to find their absolute paths.
 *
 * @returns {Promise<() => Promise<void>>}
 *   A cleanup function that disposes all resources instantiated.
 */
export async function develop(args, rootDir = process.cwd()) {
  let builder;
  let subscription;

  try {
    const pathsToWatch = [
      absolutizePath(args.data, rootDir),
      absolutizePath(args.template, rootDir)
    ];

    for (const pathToWatch of pathsToWatch) {
      if (!(await pathExists(pathToWatch))) {
        throw new Error(`'${pathToWatch}' does not exist.`);
      }
    }

    builder = await getBuilder();
    await builder.build(args, rootDir);

    subscription = await watcher.subscribe(
      rootDir,
      async (watcherError, events) => {
        if (watcherError !== null) {
          throw watcherError;
        }

        const match = events.find(({ path }) => pathsToWatch.includes(path));

        if (typeof match === "undefined" || match.type !== "update") {
          return;
        }

        try {
          await builder.build(args, rootDir);
        } catch (error) {
          if (errorsToDisregard.includes(error.message)) {
            return;
          }

          throw error;
        }
      }
    );

    return async () => {
      await subscription.unsubscribe();
      await builder.close();
    };
  } catch (error) {
    await subscription?.unsubscribe();
    await builder?.close();
    throw error;
  }
}

/**
 * Instantiates resources needed for PDF generation, outputs a PDF file using
 * data and template files, then disposes all resources instantiated.
 *
 * @param {BuildOptions} args
 * @param {string} rootDir
 *   Defaults to `process.cwd()`. Prepended to the relative paths passed to
 *   `args` to find their absolute paths.
 *
 * @returns {Promise<void>}
 */
export async function build(args, rootDir = process.cwd()) {
  let builder;

  try {
    builder = await getBuilder();
    await builder.build(args, rootDir);
  } finally {
    await builder?.close();
  }
}

/**
 * Instantiates resources needed for PDF generation then returns a
 * {@link Builder} object.
 *
 * @returns {Promise<Builder>}
 */
export async function getBuilder() {
  const pdfRenderer = await getPDFRenderer();
  let isClosed = false;

  return {
    async build({ data, template, output, options }, rootDir = process.cwd()) {
      if (isClosed) {
        return;
      }

      if (typeof rootDir !== "string") {
        throw new TypeError(
          `'rootDir' must be a string, given '${typeof rootDir}'`
        );
      }

      if (!(await pathExists(rootDir))) {
        throw new Error(`Root directory '${rootDir}' does not exist`);
      }

      const liquid = new Liquid(options?.liquidOptions);
      const html = await renderHTML(
        absolutizePath(template, rootDir),
        liquid.parseAndRender.bind(liquid),
        await getData(absolutizePath(data, rootDir))
      );

      const outputFile = absolutizePath(output, rootDir);
      const outputDir = nodePath.dirname(outputFile);

      if (!(await pathExists(outputDir))) {
        await fs.mkdir(outputDir, { recursive: true });
      }

      await fs.writeFile(
        outputFile,
        await pdfRenderer.render(encodeHTML(html), options?.pdfOptions)
      );
    },
    async close() {
      if (isClosed) {
        return;
      }

      await pdfRenderer.close();
      // 'isClosed' is meant to only be reassigned here and nowhere else.
      isClosed = true;
    }
  };
}

/**
 * Reads the contents of the YAML file in `path` then returns its JavaScript
 * representation.
 *
 * @param {string} path
 *
 * @returns {Promise<any>}
 */
export async function getData(path) {
  if (typeof path !== "string") {
    throw new TypeError(`'path' must be a string, given '${typeof path}'`);
  }

  if (!(await pathExists(path))) {
    throw new Error(`Data file '${path}' does not exist`);
  }

  const ext = nodePath.extname(path);
  const data = await fs.readFile(path, "utf-8");

  if ([".yml", ".yaml"].includes(ext)) {
    return YAML.parse(data);
  }

  throw new Error(`Only YAML format is accepted, given '${ext}'`);
}

/**
 * Renders HTML from the template found in `path` using the `render` function
 * and `data` object passed.
 *
 * @param {string} path
 * @param {RenderLiquid} render
 * @param {object} [data]
 *
 * @returns {Promise<string>}
 *   The rendered HTML.
 */
export async function renderHTML(path, render, data) {
  if (typeof path !== "string") {
    throw new TypeError(`'path' must be a string, given '${typeof path}'`);
  }

  if (!(await pathExists(path))) {
    throw new Error(`Template file '${path}' does not exist`);
  }

  if (typeof render !== "function") {
    throw new TypeError(
      `'render' must be a function, given '${typeof render}'`
    );
  }

  if (typeof data !== "object" && typeof data !== "undefined") {
    throw new TypeError(
      `'data' must be an object or undefined, given '${typeof data}'`
    );
  }

  if (data === null) {
    throw new TypeError("'data' must be an object or undefined, given 'null'");
  }

  return render(await fs.readFile(path, "utf-8"), data);
}

/**
 * Encodes `html` into a Data URL.
 *
 * @param {string} html
 *
 * @returns {string}
 *   The HTML Data URL.
 */
export function encodeHTML(html) {
  if (typeof html !== "string") {
    throw new TypeError(`'html' must be a string, given '${typeof html}'`);
  }

  return `data:text/html,${encodeURIComponent(html)}`;
}

/**
 * Instantiates resources needed for PDF generation then returns a
 * {@link PDFRenderer} object.
 *
 * @returns {Promise<PDFRenderer>}
 */
export async function getPDFRenderer() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  let isClosed = false;

  return {
    async render(url, options) {
      if (isClosed) {
        return Buffer.from("");
      }

      await page.goto(url, { waitUntil: "load" });
      return page.pdf(options);
    },
    async close() {
      if (isClosed) {
        return;
      }

      await browser.close();
      // 'isClosed' is meant to only be reassigned here and nowhere else.
      isClosed = true;
    }
  };
}

/**
 * Absolutizes `path` by joining it to `rootDir` then normalizes the output.
 * Returns a normalized `path` if it is already an absolute path.
 *
 * @param {string} path
 * @param {string} rootDir
 *   Defaults to `process.cwd()`.
 *
 * @returns {string}
 */
export function absolutizePath(path, rootDir = process.cwd()) {
  if (typeof path !== "string") {
    throw new TypeError(`'path' must be a string, given '${typeof path}'`);
  }

  if (typeof rootDir !== "string") {
    throw new TypeError(
      `'rootDir' must be a string, given '${typeof rootDir}'`
    );
  }

  return nodePath.isAbsolute(path)
    ? nodePath.normalize(path)
    : nodePath.join(rootDir, path);
}

/**
 * Disables version option for non-default commands.
 *
 * @param {Argv} y
 */
export function buildNonDefaultCommand(y) {
  return y.version(false);
}

/**
 * @param {import("yargs").ArgumentsCamelCase<CLIOptions>} args
 */
export async function handle(args) {
  const {
    _: [command],
    config
  } = args;

  try {
    await (command === "build" ? build : develop)({
      ...args,
      options: await getConfig(config, "pme.config.mjs")
    });
  } catch ({ message }) {
    console.error(`Error: ${message}`);
  }
}

/**
 * @param {string} path
 * @param {string} defaultConfigFilename
 * @returns {Promise<object>}
 */
export async function getConfig(path, defaultConfigFilename) {
  if (nodePath.extname(path) !== ".mjs") {
    throw new Error(
      "Config file must be a .mjs ESM module, " +
        `'${nodePath.basename(path)}' given`
    );
  }

  let config;

  if (path === defaultConfigFilename) {
    config = (await findUp(path)) ?? nodePath.join(os.homedir(), path);

    return (await pathExists(config)) ? importDefault(config) : {};
  }

  config = absolutizePath(path);

  if (!(await pathExists(config))) {
    throw new Error(`Config file '${config}' does not exist`);
  }

  return importDefault(config);
}

/**
 * @param {string} path
 * @returns {Promise<object>}
 */
export async function importDefault(path) {
  const mod = await import(nodeUrl.pathToFileURL(path).href);

  if (typeof mod.default === "undefined") {
    throw new Error(`Config file '${path}' does not have a default export`);
  }

  if (typeof mod.default !== "object") {
    throw new TypeError(
      "Config file should have an object default export, " +
        `exported '${typeof mod.default}'`
    );
  }

  if (mod.default === null) {
    throw new TypeError(
      "Config file should have an object default export, exported 'null'"
    );
  }

  return mod.default;
}
