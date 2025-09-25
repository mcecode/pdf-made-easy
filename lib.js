import fs from "node:fs/promises";
import nodePath from "node:path";
import url from "node:url";

import chokidar from "chokidar";
import { Liquid } from "liquidjs";
import puppeteer from "puppeteer";
import YAML from "yaml";

/**
 * @typedef {import("yargs").Argv} Argv
 * @typedef {import("puppeteer").Browser} Browser
 * @typedef {import("chokidar").FSWatcher} FSWatcher
 * @typedef {import("puppeteer").Page} Page
 *
 * @typedef {import("./index.js").PMEUserConfig} PMEUserConfig
 */

/**
 * @typedef PDFBuilder
 *   Contains methods for rendering PDF files from data and template files.
 * @property {() => Promise<void>} build
 *   Outputs a PDF file using data and template files.
 * @property {() => Promise<void>} close
 *   Disposes all resources instantiated and turns {@link PDFBuilder.build} into
 *   a NOOP method.
 */

/**
 * @typedef BuildOptions
 * @property {string} data
 *   Path to YAML data file.
 * @property {PMEUserConfig} options
 *   Options passed down to Liquid and Puppeteer.
 * @property {string} output
 *   Path to PDF output file.
 * @property {string} template
 *   Path to Liquid template file.
 */

/**
 * @typedef CLIOptions
 * @property {string} config
 *   Path to JavaScript config file.
 * @property {string} data
 *   Path to YAML data file.
 * @property {string} output
 *   Path to PDF output file.
 * @property {string} template
 *   Path to Liquid template file.
 */

/**
 * Disables the version option for non-default commands.
 *
 * @param {Argv} yargs
 *
 * @returns {Argv}
 */
export function createNonDefaultCommand(yargs) {
	return yargs.version(false);
}

/**
 * Handles loading the config file and executing the correct command using
 * `args`.
 *
 * @param {import("yargs").ArgumentsCamelCase<CLIOptions>} args
 *
 * @returns {Promise<void>}
 */
export async function executeCommand(args) {
	const {
		_: [command],
		config,
	} = args;

	try {
		const options = await loadConfig(config);
		const cleanup = await (command === "build" ? buildPDF : developPDF)({
			...args,
			options,
		});

		for (const event of [
			"SIGHUP",
			"SIGINT",
			"SIGTERM",
			"uncaughtException",
			"unhandledRejection",
		]) {
			// The use of an async handler here is fine, only the `exit` event
			// requires its handler to be synchronous.
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			process.on(event, async (error, origin) => {
				try {
					await cleanup?.();
				} catch {
					// Can't do anything anymore at this point if `cleanup` rejects.
				}

				// For error events
				if (error instanceof Error && origin !== undefined) {
					printErrorThenExit(
						error,
						typeof origin === "string" ? origin : "unhandledRejection",
					);
					return;
				}

				// For signals
				process.exitCode = 0;
				process.exit();
			});
		}
	} catch (error) {
		printErrorThenExit(error, "Global Catch");
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
		throw new Error("config file must be a JavaScript file, given " + path);
	}

	if (path !== undefined) {
		const config = absolutizePath(path);
		const moduleOrError = await tryToImportConfig(config);

		if (moduleOrError instanceof TypeError) {
			throw moduleOrError;
		}

		if (moduleOrError instanceof Error) {
			throw new Error("could not import config at " + config);
		}

		return moduleOrError.default;
	}

	for (const moduleOrError of await Promise.all([
		tryToImportConfig(absolutizePath("pme.config.js")),
		tryToImportConfig(absolutizePath("pme.config.mjs")),
		tryToImportConfig(absolutizePath("pme.config.cjs")),
	])) {
		if (moduleOrError instanceof TypeError) {
			throw moduleOrError;
		}

		if (moduleOrError instanceof Error) {
			continue;
		}

		return moduleOrError.default;
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

		const mod = await import(url.pathToFileURL(path).toString());

		if (Object.prototype.toString.call(mod?.default) !== "[object Object]") {
			throw new TypeError("config's default export must be an object");
		}

		return mod;

		/* eslint-enable @typescript-eslint/no-unsafe-assignment */
		/* eslint-enable @typescript-eslint/no-unsafe-member-access */
		/* eslint-enable @typescript-eslint/no-unsafe-return */
	} catch (error) {
		// @ts-expect-error - This can either be an `ERR_MODULE_NOT_FOUND` `Error`
		// if `import` fails or a `TypeError` if `mod.default` is not an object.
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
async function buildPDF(args) {
	/** @type {PDFBuilder | undefined} */
	let builder;

	try {
		builder = await getPDFBuilder(args);
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
async function developPDF(args) {
	/** @type {PDFBuilder | undefined} */
	let builder;
	/** @type {FSWatcher | undefined} */
	let watcher;

	try {
		builder = await getPDFBuilder(args);
		await builder.build();

		watcher = chokidar
			.watch([absolutizePath(args.data), absolutizePath(args.template)])
			// TODO: Handle possible race conditions when events fire too close to
			// each other (e.g., the data and template files are saved at the same
			// time).
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			.on("change", async () => {
				try {
					await builder?.build();
				} catch (error) {
					printErrorThenExit(error, "Builder (Likely Puppeteer)");
				}
			})
			.on("error", (error) => {
				printErrorThenExit(error, "Watcher");
			});

		return async () => {
			await watcher?.close();
			await builder?.close();
		};
	} catch (error) {
		await watcher?.close();
		await builder?.close();
		throw error;
	}
}

/**
 * Instantiates resources needed for PDF generation then returns a
 * {@link PDFBuilder} object.
 *
 * @param {BuildOptions} args
 *
 * @returns {Promise<PDFBuilder>}
 */
async function getPDFBuilder({ data, options, output, template }) {
	/** @type {Liquid | undefined} */
	let liquid = new Liquid(options.liquidOptions);
	/** @type {Browser | undefined} */
	let browser = await puppeteer.launch({
		...options.launchOptions,
		handleSIGHUP: false,
		handleSIGINT: false,
		handleSIGTERM: false,
	});
	/** @type {Page | undefined} */
	let page = await browser.newPage();

	return {
		async build() {
			if (liquid === undefined || browser === undefined || page === undefined) {
				return;
			}

			// Get template
			const templateFile = absolutizePath(template);
			if (nodePath.extname(templateFile) !== ".liquid") {
				throw new Error(
					"template file must be a Liquid file, given " + templateFile,
				);
			}
			/** @type {string} */
			let templateContents;
			try {
				templateContents = await fs.readFile(templateFile, "utf-8");
			} catch {
				throw new Error("could not read template file at " + templateFile);
			}

			// Get data
			const dataFile = absolutizePath(data);
			if (![".yml", ".yaml"].includes(nodePath.extname(dataFile))) {
				throw new Error("data file must be a YAML file, given " + dataFile);
			}
			/** @type {object | undefined} */
			let dataContents;
			try {
				// No going around `YAML.parse` returning an `any` type.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				dataContents = YAML.parse(await fs.readFile(dataFile, "utf-8"));
			} catch {
				throw new Error("could not read and parse data file at " + dataFile);
			}
			if (
				dataContents !== undefined &&
				Object.prototype.toString.call(dataContents) !== "[object Object]"
			) {
				throw new TypeError("data must be an object or undefined");
			}

			// Prepare output path
			const outputFile = absolutizePath(output);
			await fs.mkdir(nodePath.dirname(outputFile), { recursive: true });

			// Render PDF from rendered HTML
			await page.setContent(
				// No going around `liquid.parseAndRender` returning an `any` type.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
				await liquid.parseAndRender(templateContents, dataContents),
			);
			await page.pdf({ ...options.pdfOptions, path: outputFile });
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
		},
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
	return nodePath.isAbsolute(path)
		? nodePath.normalize(path)
		: nodePath.join(process.cwd(), path);
}

/**
 * Helper for handling thrown errors that can't or shouldn't be recovered from.
 *
 * @param {unknown} error
 *
 * @param {string} origin
 */
function printErrorThenExit(error, origin) {
	console.error("Encountered Error!");
	console.error("Origin:", origin);
	console.error(error);

	process.exitCode = 1;
	// This is fine since this function is only called on unrecoverable errors.
	// eslint-disable-next-line unicorn/no-process-exit
	process.exit();
}
