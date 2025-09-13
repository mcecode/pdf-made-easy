import fs from "node:fs/promises";
import nodePath from "node:path";

import { Liquid } from "liquidjs";
import puppeteer from "puppeteer";
import watcher from "@parcel/watcher";
import YAML from "yaml";

/**
 * @typedef {import("puppeteer").Browser} Browser
 * @typedef {import("puppeteer").Page} Page
 * @typedef {import("yargs").Argv} Argv
 *
 * @typedef {import("./index.d.ts").PMEUserConfig} PMEUserConfig
 */

/**
 * @typedef Builder
 *   Contains methods for rendering PDF files from data and template files.
 * @property {() => Promise<void>} build
 *   Outputs a PDF file using data and template files.
 * @property {() => Promise<void>} close
 *   Disposes all resources instantiated and turns {@link Builder.build} into a
 *   NOOP method.
 */

/**
 * @typedef BuildOptions
 * @property {string} data
 *   Path to YAML data file.
 * @property {string} template
 *   Path to Liquid template file.
 * @property {string} output
 *   Path to PDF output file.
 * @property {PMEUserConfig} options
 *   Options passed down to Liquid and Puppeteer.
 */

/**
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
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
      return;
    }

    console.error("Encountered unknown error:");
    console.error(error);
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
    path !== undefined &&
    ![".js", ".mjs", ".cjs"].includes(nodePath.extname(path))
  ) {
    throw new Error(
      "Config file must be a JavaScript file, " +
        `'${nodePath.basename(path)}' given`
    );
  }

  if (path !== undefined) {
    const config = absolutizePath(path);
    const mod = await tryToImportConfig(config);

    if (mod instanceof TypeError) {
      throw mod;
    }

    if (mod instanceof Error) {
      // This error isn't thrown because of a type error but because the config
      // couldn't be imported.
      throw new Error(`Config file '${config}' could not be imported`);
    }

    return mod.default;
  }

  for (const mod of await Promise.all([
    tryToImportConfig(absolutizePath("pme.config.js")),
    tryToImportConfig(absolutizePath("pme.config.mjs")),
    tryToImportConfig(absolutizePath("pme.config.cjs"))
  ])) {
    if (mod instanceof TypeError) {
      throw mod;
    }

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
 * in `path` or a `TypeError` if the module's default export is not an object.
 *
 * @param {string} path
 *
 * @returns {Promise<Error | TypeError | { default: object }>}
 */
async function tryToImportConfig(path) {
  try {
    // There's no going around the fact that `import`ing like this is unsafe.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    /* eslint-disable @typescript-eslint/no-unsafe-member-access */
    /* eslint-disable @typescript-eslint/no-unsafe-return */

    const mod = await import(path);

    if (typeof mod?.default !== "object") {
      throw new TypeError(
        "Config file should have an object default export, " +
          `found '${typeof mod?.default}'`
      );
    }

    if (mod?.default === null) {
      throw new TypeError(
        "Config file should have an object default export, found 'null'"
      );
    }

    return mod;

    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    /* eslint-enable @typescript-eslint/no-unsafe-member-access */
    /* eslint-enable @typescript-eslint/no-unsafe-return */
  } catch (error) {
    // @ts-expect-error - This can either be an `ERR_MODULE_NOT_FOUND` `Error`
    // if `import` fails or a `TypeError` if `mod.default` is not an `object`.
    return error;
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
  /** @type {Builder | undefined} */
  let builder;

  try {
    builder = await getBuilder(args);
    await builder.build();
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
  /** @type {Builder | undefined} */
  let builder;
  /** @type {watcher.AsyncSubscription | undefined} */
  let subscription;

  try {
    const pathsToWatch = [
      absolutizePath(args.data),
      absolutizePath(args.template)
    ];

    for (const pathToWatch of await Promise.allSettled(
      pathsToWatch.map(async (p) => fs.access(p))
    )) {
      if (pathToWatch.status === "rejected") {
        // Path exists here as a string since `fs.access` threw an error.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        throw new Error(pathToWatch.reason?.path + " does not exist");
      }
    }

    builder = await getBuilder(args);
    await builder.build();

    subscription = await watcher.subscribe(
      process.cwd(),
      async (watcherError, events) => {
        if (watcherError !== null) {
          throw watcherError;
        }

        const match = events.find(({ path }) => pathsToWatch.includes(path));

        if (match === undefined || match.type !== "update") {
          return;
        }

        try {
          await builder?.build();
        } catch (error) {
          // TODO: Fix
          // These are the downstream error messages thrown due to the
          // `fs.readFile` in `getData` sometimes returning an empty string when
          // used together with `@parcel/watcher`. They are disregarded for now
          // until a better solution can be made.
          if (
            error instanceof Error &&
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
      await subscription?.unsubscribe();
      await builder?.close();
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
 * @param {BuildOptions} args
 *
 * @returns {Promise<Builder>}
 */
async function getBuilder({ data, template, output, options }) {
  /** @type {Liquid | undefined} */
  let liquid = new Liquid(options.liquidOptions);
  /** @type {Browser | undefined} */
  let browser = await puppeteer.launch(options.launchOptions);
  /** @type {Page | undefined} */
  let page = await browser.newPage();

  return {
    async build() {
      if (liquid === undefined || browser === undefined || page === undefined) {
        return;
      }

      // Get template
      const templateFile = absolutizePath(template);
      /** @type {string} */
      let templateContents;
      try {
        templateContents = await fs.readFile(templateFile, "utf-8");
      } catch {
        throw new Error(`Template file '${templateFile}' does not exist`);
      }

      // Get data
      const dataFile = absolutizePath(data);

      const dataExt = nodePath.extname(dataFile);
      if (![".yml", ".yaml"].includes(dataExt)) {
        throw new Error(`Only YAML format is accepted, given '${dataExt}'`);
      }

      /** @type {object | undefined | null} */
      let dataContents;
      try {
        // No going around `YAML.parse` returning an `any` type.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        dataContents = YAML.parse(await fs.readFile(dataFile, "utf-8"));
      } catch {
        throw new Error(`Data file '${dataFile}' does not exist`);
      }
      if (dataContents !== undefined && typeof dataContents !== "object") {
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
      await fs.mkdir(nodePath.dirname(outputFile), { recursive: true });

      // Render HTML from template and data
      const encodedHtml =
        "data:text/html," +
        encodeURIComponent(
          // No going around `liquid.parseAndRender` returning an `any` type.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await liquid.parseAndRender(templateContents, dataContents)
        );

      // Render PDF from HTML
      await page.goto(encodedHtml);
      await fs.writeFile(outputFile, await page.pdf(options.pdfOptions));
    },
    async close() {
      liquid = undefined;

      // These reassignments shouldn't cause any problems as long as `build`
      // and `close` are `await`ed properly.
      /* eslint-disable require-atomic-updates */

      await page?.close();
      page = undefined;

      await browser?.close();
      browser = undefined;

      /* eslint-enable require-atomic-updates */
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
