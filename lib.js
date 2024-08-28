import fs from "node:fs/promises";
import nodePath from "node:path";

import watcher from "@parcel/watcher";
import { Liquid } from "liquidjs";
// TODO: Refactor out dependency from `pathExists`, just try to open the file
// and handle any errors from there.
import { pathExists } from "path-exists";
import puppeteer from "puppeteer";
import YAML from "yaml";

/**
 * @typedef {import("puppeteer").Browser} Browser
 * @typedef {import("puppeteer").Page} Page
 * @typedef {import("yargs").Argv} Argv
 *
 * @typedef {import("./index.d.ts").PMEUserConfig} PMEUserConfig
 *
 * @typedef Builder
 *   Contains methods for rendering PDF files from data and template files.
 * @property {(args: BuildOptions) => Promise<void>} build
 *   Outputs a PDF file using data and template files.
 * @property {() => Promise<void>} close
 *   Disposes all resources instantiated and turns {@link Builder.build} and
 *   {@link Builder.close} into NOOP methods.
 *
 * @typedef BuildOptions
 * @property {string} data
 *   Path to YAML data file.
 * @property {string} template
 *   Path to Liquid template file.
 * @property {string} output
 *   Path to PDF output file.
 * @property {PMEUserConfig} options
 *   Options passed down to Liquid and Puppeteer.
 *
 * @typedef CLIOptions
 * @property {string} data
 *   Path to YAML data file.
 * @property {string} template
 *   Path to Liquid template file.
 * @property {string} output
 *   Path to PDF output file.
 * @property {string} config
 *   Path to JavaScript config file.
 */

// TODO: Improve error messages.

/**
 * Disables the version option for non-default commands.
 *
 * @param {Argv} yargs
 *
 * @returns {Argv}
 */
export function buildNonDefaultCommand(yargs) {
  return yargs.version(false);
}

/**
 * Handles loading the config file and executing the correct command based on
 * `args`.
 *
 * @param {import("yargs").ArgumentsCamelCase<CLIOptions>} args
 *
 * @returns {Promise<void>}
 */
export async function executeCommand(args) {
  const {
    _: [command],
    config
  } = args;

  try {
    const options = await loadConfig(config);

    // Execute command
    // TODO: Handle calling develop's cleanup function on exit.
    // https://stackoverflow.com/questions/20165605/detecting-ctrlc-in-node-js
    await (command === "build" ? build : develop)({ ...args, options });
  } catch ({ message }) {
    console.error(`Error: ${message}`);
  }
}

/**
 * Tries to import and return the default export of the config found in `path`.
 * If `path` is `undefined`, default config file names are tried. Returns an
 * empty object if no config file is found.
 *
 * @param {string} [path]
 *
 * @returns {Promise<PMEUserConfig>}
 */
async function loadConfig(path) {
  if (
    typeof path !== "undefined" &&
    ![".js", ".mjs", ".cjs"].includes(nodePath.extname(path))
  ) {
    throw new Error(
      "Config file must be a JavaScript file, " +
        `'${nodePath.basename(path)}' given`
    );
  }

  if (typeof path !== "undefined") {
    const config = absolutizePath(path);
    const mod = await tryToImportConfig(config);

    if (mod instanceof Error) {
      throw new Error(`Config file '${config}' does not exist`);
    }

    return mod.default;
  }

  for (const config of [
    absolutizePath("pme.config.js"),
    absolutizePath("pme.config.mjs"),
    absolutizePath("pme.config.cjs")
  ]) {
    const mod = await tryToImportConfig(config);

    if (mod instanceof Error) {
      continue;
    }

    return mod.default;
  }

  return {};
}

/**
 * Tries to import and return the config found in `path` while checking if its
 * default export is an object or not. Returns an `Error` if no module is found
 * in `path`.
 *
 * @param {string} path
 *
 * @returns {Promise<{ default: object }>}
 */
async function tryToImportConfig(path) {
  try {
    const mod = await import(path);

    if (typeof mod.default !== "object") {
      throw new TypeError(
        "Config file should have an object default export, " +
          `found '${typeof mod.default}'`
      );
    }

    if (mod.default === null) {
      throw new TypeError(
        "Config file should have an object default export, found 'null'"
      );
    }

    return mod;
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      return error;
    }

    throw error;
  }
}

/**
 * Instantiates resources needed for PDF generation, outputs a PDF file using
 * data and template files, then disposes all resources instantiated.
 *
 * @param {BuildOptions} args
 *
 * @returns {Promise<void>}
 */
async function build(args) {
  let builder;

  try {
    builder = await getBuilder();
    await builder.build(args);
  } finally {
    await builder?.close();
  }
}

/**
 * Instantiates resources needed for PDF generation, then watches data and
 * template files for changes and outputs a PDF file on change.
 *
 * @param {BuildOptions} args
 *
 * @returns {Promise<() => Promise<void>>}
 *   A cleanup function that disposes all resources instantiated.
 */
async function develop(args) {
  let builder;
  let subscription;

  try {
    const pathsToWatch = [
      absolutizePath(args.data),
      absolutizePath(args.template)
    ];

    for (const pathToWatch of pathsToWatch) {
      if (!(await pathExists(pathToWatch))) {
        throw new Error(`'${pathToWatch}' does not exist.`);
      }
    }

    builder = await getBuilder();
    await builder.build(args);

    subscription = await watcher.subscribe(
      process.cwd(),
      async (watcherError, events) => {
        if (watcherError !== null) {
          throw watcherError;
        }

        const match = events.find(({ path }) => pathsToWatch.includes(path));

        if (typeof match === "undefined" || match.type !== "update") {
          return;
        }

        try {
          await builder.build(args);
        } catch (error) {
          // TODO: Fix
          // These are the downstream error messages thrown due to the
          // `fs.readFile` in `getData` sometimes returning an empty string when
          // used together with `@parcel/watcher`. They are disregarded for now
          // until a better solution can be made.
          if (
            error.message ===
            "'data' must be an object or undefined, given 'null'"
          ) {
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
 * Instantiates resources needed for PDF generation then returns a
 * {@link Builder} object.
 *
 * @returns {Promise<Builder>}
 */
async function getBuilder() {
  let isClosed = false;
  /** @type {Liquid | null} */
  let liquid = null;
  /** @type {Browser | null} */
  let browser = null;
  /** @type {Page | null} */
  let page = null;

  return {
    async build({ data, template, output, options }) {
      if (isClosed) {
        return;
      }

      // Get template
      const templateFile = absolutizePath(template);
      if (!(await pathExists(templateFile))) {
        throw new Error(`Template file '${templateFile}' does not exist`);
      }

      const templateContents = await fs.readFile(templateFile, "utf-8");

      // Get data
      const dataFile = absolutizePath(data);
      if (!(await pathExists(dataFile))) {
        throw new Error(`Data file '${dataFile}' does not exist`);
      }

      const dataExt = nodePath.extname(dataFile);
      if (![".yml", ".yaml"].includes(dataExt)) {
        throw new Error(`Only YAML format is accepted, given '${dataExt}'`);
      }

      const dataContents = YAML.parse(await fs.readFile(dataFile, "utf-8"));
      if (
        typeof dataContents !== "object" &&
        typeof dataContents !== "undefined"
      ) {
        throw new TypeError(
          "'data' must be an object or undefined, given " +
            `'${typeof dataContents}'`
        );
      }
      if (dataContents === null) {
        throw new TypeError(
          "'data' must be an object or undefined, given 'null'"
        );
      }

      // Prepare output path
      const outputFile = absolutizePath(output);
      const outputDir = nodePath.dirname(outputFile);
      if (!(await pathExists(outputDir))) {
        await fs.mkdir(outputDir, { recursive: true });
      }

      // Render HTML from template and data
      if (liquid === null) {
        liquid = new Liquid(options.liquidOptions);
      }
      const encodedHtml =
        "data:text/html," +
        encodeURIComponent(
          await liquid.parseAndRender(templateContents, dataContents)
        );

      // Render PDF from HTML
      if (browser === null) {
        browser = await puppeteer.launch(options.puppeteerLaunchOptions);
      }
      if (page === null) {
        page = await browser.newPage();
      }
      await page.goto(encodedHtml);
      await fs.writeFile(outputFile, await page.pdf(options.pdfOptions));
    },
    async close() {
      if (isClosed) {
        return;
      }

      liquid = null;

      await page?.close();
      page = null;

      await browser?.close();
      browser = null;

      // 'isClosed' is meant to only be reassigned here and nowhere else.
      isClosed = true;
    }
  };
}

/**
 * Absolutizes `path` by joining it to the current working directory then
 * normalizes the output. Returns a normalized `path` if it is already an
 * absolute path.
 *
 * @param {string} path
 *
 * @returns {string}
 */
function absolutizePath(path) {
  if (typeof path !== "string") {
    throw new TypeError(`'path' must be a string, given '${typeof path}'`);
  }

  return nodePath.isAbsolute(path)
    ? nodePath.normalize(path)
    : nodePath.join(process.cwd(), path);
}
