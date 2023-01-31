import fs from "node:fs/promises";
import nodePath from "node:path";

import JSON5 from "json5";
import { Liquid } from "liquidjs";
import YAML from "yaml";
import { pathExists } from "find-up";
import puppeteer from "puppeteer";
import watcher from "@parcel/watcher";

// These are the downstream error messages thrown due to the 'fs.readFile' in
// 'getData' sometimes returning an empty string when used together with
// @parcel/watcher. They are disregarded for now until a better solution can be
// made.
const errorsToDisregard = [
  "'data' must be an object or undefined, given 'null'",
  "JSON5: invalid end of input at 1:1"
];

/** @type {import("./index").develop} */
export async function develop(args, rootDir = process.cwd()) {
  let builder;
  let subscription;

  try {
    const pathsToWatch = [
      absolutizePath(args.data, rootDir),
      absolutizePath(args.template, rootDir)
    ];

    for (const pathToWatch of pathsToWatch) {
      // eslint-disable-next-line no-await-in-loop
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

/** @type {import("./index").build} */
export async function build(args, rootDir = process.cwd()) {
  let builder;

  try {
    builder = await getBuilder();
    await builder.build(args, rootDir);
  } finally {
    await builder?.close();
  }
}

/** @type {import("./index").getBuilder} */
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

      const html = await renderHTML(
        absolutizePath(template, rootDir),
        (options?.getTemplateRenderer ?? getDefaultTemplateRenderer)(
          // This should be fine as long as 'T' is set when using a custom
          // renderer and left to the default 'LiquidOptions' when using the
          // default renderer.
          // @ts-expect-error
          options?.templateOptions
        ),
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
      // eslint-disable-next-line require-atomic-updates
      isClosed = true;
    }
  };
}

/**
 * @param {import("liquidjs/dist/liquid-options").LiquidOptions} [options]
 * @returns {import("./index").RenderTemplate}
 */
function getDefaultTemplateRenderer(options) {
  const liquid = new Liquid(options);

  return (template, data) => liquid.parseAndRender(template, data);
}

/** @type {import("./index").getData} */
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
    return parseData(data);
  }

  if ([".json", ".jsonc", ".json5"].includes(ext)) {
    return parseData(data, "json");
  }

  throw new Error(
    `Only YAML, JSON, JSONC, and JSON5 formats are accepted, given ${ext}`
  );
}

/** @type {import("./index").parseData} */
export function parseData(data, type = "yaml") {
  if (typeof data !== "string") {
    throw new TypeError(`'data' must be a string, given '${typeof data}'`);
  }

  if (!["yaml", "json"].includes(type)) {
    throw new Error(`'type' must either be 'yaml' or 'json', given '${type}'`);
  }

  return type === "yaml" ? YAML.parse(data) : JSON5.parse(data);
}

/** @type {import("./index").renderHTML} */
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

/** @type {import("./index").encodeHTML} */
export function encodeHTML(html) {
  if (typeof html !== "string") {
    throw new TypeError(`'html' must be a string, given '${typeof html}'`);
  }

  return `data:text/html,${encodeURIComponent(html)}`;
}

/** @type {import("./index").getPDFRenderer} */
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
      // eslint-disable-next-line require-atomic-updates
      isClosed = true;
    }
  };
}

/** @type {import("./index").absolutizePath} */
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
