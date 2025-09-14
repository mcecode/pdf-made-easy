import fs from "node:fs/promises";
import nodePath from "node:path";

import { Liquid } from "liquidjs";
import puppeteer from "puppeteer";
import watcher from "@parcel/watcher";
import YAML from "yaml";

/**
 * @typedef {import("yargs").Argv} Argv
 * @typedef {import("puppeteer").Browser} Browser
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

// TODO: Improve error messages.

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
					// Can't do anything anymore at this point if `cleanup` throws.
				}

				if (error instanceof Error && origin !== undefined) {
					process.exitCode = 1;

					console.error(
						"Error encountered:",
						typeof origin === "string" ? origin : "unhandledRejection",
						"\n",
					);
					console.error(error);
				} else {
					process.exitCode = 0;
				}

				process.exit();
			});
		}
	} catch (error) {
		process.exitCode = 1;
		console.error("Error encountered:\n");
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
				`'${nodePath.basename(path)}' given`,
		);
	}

	if (path !== undefined) {
		const config = absolutizePath(path);
		const moduleOrError = await tryToImportConfig(config);

		if (moduleOrError instanceof TypeError) {
			throw moduleOrError;
		}

		if (moduleOrError instanceof Error) {
			throw new Error(`Config file '${config}' could not be imported`);
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

		const mod = await import(path);

		if (typeof mod?.default !== "object") {
			throw new TypeError(
				"Config file should have an object default export, " +
					`found '${typeof mod?.default}'`,
			);
		}

		if (mod?.default === null) {
			throw new TypeError(
				"Config file should have an object default export, found 'null'",
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
	/** @type {watcher.AsyncSubscription | undefined} */
	let subscription;

	try {
		const pathsToWatch = [
			absolutizePath(args.data),
			absolutizePath(args.template),
		];

		for (const pathToWatch of await Promise.allSettled(
			pathsToWatch.map(async (p) => fs.access(p)),
		)) {
			if (pathToWatch.status === "rejected") {
				// Path exists here as a string since `fs.access` threw an error.
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
				throw new Error(pathToWatch.reason?.path + " does not exist");
			}
		}

		builder = await getPDFBuilder(args);
		await builder.build();

		subscription = await watcher.subscribe(
			process.cwd(),
			async (watcherError, events) => {
				try {
					if (watcherError !== null) {
						throw watcherError;
					}

					const match = events.find(({ path }) => pathsToWatch.includes(path));

					if (match === undefined || match.type !== "update") {
						return;
					}

					await builder?.build();
				} catch (error) {
					try {
						await subscription?.unsubscribe();
						await builder?.close();
					} catch {
						// This will become an `unhandledRejection` if not caught here. What
						// should be reported is the root cause, not the failure to clean up
						// after it.
					}

					process.exitCode = 1;
					console.error("Error encountered:\n");
					console.error(error);
				}
			},
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
		headless: true,
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
						`'${typeof dataContents}'`,
				);
			}
			if (dataContents === null) {
				throw new TypeError(
					"'data' must be an object or undefined, given 'null'",
				);
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
	if (typeof path !== "string") {
		throw new TypeError(`'path' must be a string, given '${typeof path}'`);
	}

	return nodePath.isAbsolute(path)
		? nodePath.normalize(path)
		: nodePath.join(process.cwd(), path);
}
