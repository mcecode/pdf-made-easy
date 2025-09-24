import assert from "node:assert/strict";
import cp from "node:child_process";
import path from "node:path";
import util from "node:util";
import { describe, it } from "node:test";

import { defineConfig } from "../index.js";
import { deleteFile, getPDFInfo, getPDFText } from "./helper.js";

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

				const output = path.join(
					cwd,
					c.useCustomFiles ? "custom.pdf" : "output.pdf",
				);
				await deleteFile(output);

				const args = [cliFile, "build"];
				if (c.useCustomFiles) {
					args.push(
						"--data",
						"custom.yml",
						"-o",
						output,
						"--template",
						"custom.liquid",
					);
				}
				if (c.useConfig && c.useCustomFiles) {
					args.push("-c", "custom.js");
				}

				await execFile("node", args, { cwd });

				ctx.assert.snapshot(await c.snapshot(output));
			}),
		),
	);
});
