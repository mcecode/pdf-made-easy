import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { describe, it } from "node:test";

import { defineConfig } from "../index.js";
import { deleteFileIfExists, getPDFInfo, getPDFText, sleep } from "./helper.js";

await describe("defineConfig", async () => {
	await it("throws when config is not an object", () => {
		for (const config of [
			"not object",
			// eslint-disable-next-line @typescript-eslint/no-magic-numbers
			99,
			true,
			// eslint-disable-next-line unicorn/no-null
			null,
			undefined,
			/not object/u,
		]) {
			// @ts-expect-error - For the test
			assert.throws(() => defineConfig(config), {
				message: "invalid config provided",
				name: "TypeError",
			});
		}
	});

	await it("throws when config has invalid keys", () => {
		// @ts-expect-error - For the test
		assert.throws(() => defineConfig({ invalid: {} }), {
			message: "invalid config keys provided",
			name: "TypeError",
		});
	});

	await it("returns config when config is valid", () => {
		/** @type {import("../index.js").PMEUserConfig} */
		let config = {};
		assert.strictEqual(defineConfig(config), config);

		config = { pdfOptions: { format: "A4" } };
		assert.strictEqual(defineConfig(config), config);
	});
});

const testDir = import.meta.dirname;
const cliFile = path.join(path.dirname(testDir), "cli.js");
const execFile = util.promisify(cp.execFile);

const buildCases = [
	{
		case: "complex input, default files, no config",
		expects: "PDF with correct info",
		fixture: "complex-input",
		snapshot: getPDFInfo,
		useConfig: false,
		useCustomFiles: false,
	},
	{
		case: "simple input, default files, default config",
		expects: "PDF with correct text",
		fixture: "default-config",
		snapshot: getPDFText,
		useConfig: true,
		useCustomFiles: false,
	},
	{
		case: "simple input, custom files, custom config",
		expects: "PDF with correct text",
		fixture: "custom-files",
		snapshot: getPDFText,
		useConfig: true,
		useCustomFiles: true,
	},
];

// These tests only check that the inputs given are reflected in the generated
// PDFs since Puppeteer is already expected to generate valid PDFs.
await describe("cli.js", async () => {
	await Promise.allSettled(
		buildCases.map(async (c) =>
			it(`creates ${c.expects} using ${c.case}`, async (ctx) => {
				const cwd = path.join(testDir, "fixtures", "build", c.fixture);

				const outputFile = path.join(
					cwd,
					c.useCustomFiles ? "custom.pdf" : "output.pdf",
				);
				// Delete output PDF from previous run to make sure the PDF being tested
				// is from the current run.
				await deleteFileIfExists(outputFile);

				const nodeArgs = [cliFile, "build"];
				if (c.useCustomFiles) {
					nodeArgs.push(
						"--data",
						"custom.yml",
						"-o",
						outputFile,
						"--template",
						"custom.liquid",
					);
				}
				if (c.useConfig && c.useCustomFiles) {
					nodeArgs.push("-c", "custom.js");
				}

				await execFile("node", nodeArgs, { cwd });

				ctx.assert.snapshot(await c.snapshot(outputFile));
			}),
		),
	);

	await it("updates PDF with correct text using simple input, default files, no config", async (ctx) => {
		const DURATION_TO_WAIT_FOR_PDF_TO_UPDATE = 1000;

		const cwd = path.join(testDir, "fixtures", "dev");

		const outputFile = path.join(cwd, "output.pdf");
		// Delete output PDF from previous run to make sure the PDF being tested is
		// from the current run.
		await deleteFileIfExists(outputFile);

		const dataFile = path.join(cwd, "data.yml");
		const dataContents = await fs.readFile(dataFile, "utf-8");

		const controller = new AbortController();
		// Execute CLI in a separete context so its termination doesn't cause test
		// failure.
		void (async () => {
			try {
				await execFile("node", [cliFile], { cwd, signal: controller.signal });
			} catch (error) {
				// Being aborted means `SIGTERM` was sent to the CLI, which is one way
				// the CLI expects to be terminated.
				if (error instanceof Error && error.name === "AbortError") {
					return;
				}

				throw error;
			}
		})();

		// Initial PDF generation
		await sleep(DURATION_TO_WAIT_FOR_PDF_TO_UPDATE);
		ctx.assert.snapshot(await getPDFText(outputFile));

		// Update PDF contents
		await fs.writeFile(dataFile, "title: Changed Document Title\n", "utf-8");
		await sleep(DURATION_TO_WAIT_FOR_PDF_TO_UPDATE);
		ctx.assert.snapshot(await getPDFText(outputFile));

		// Reset data file
		await fs.writeFile(dataFile, dataContents, "utf-8");
		await sleep(DURATION_TO_WAIT_FOR_PDF_TO_UPDATE);
		ctx.assert.snapshot(await getPDFText(outputFile));

		// Terminate CLI
		controller.abort();
	});
});
