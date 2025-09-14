import assert from "node:assert/strict";
import cp from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import util from "node:util";
import { before, describe, it } from "node:test";

import { defineConfig } from "../index.js";

const testDir = import.meta.dirname;
const outputFile = path.join(testDir, "fixtures", "output.pdf");
const execFile = util.promisify(cp.execFile);

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

await describe("cli.js", async () => {
	before(async () => {
		try {
			await fs.access(outputFile);
			await fs.rm(outputFile);
		} catch (error) {
			if (error instanceof Error && error.message.includes("ENOENT")) {
				return;
			}

			throw error;
		}
	});

	await it("creates the PDF file", async () => {
		await execFile(
			"node",
			[
				"../cli.js",
				"build",
				"--data",
				"fixtures/data.yml",
				"--template",
				"fixtures/template.liquid",
				"--output",
				outputFile,
			],
			{ cwd: testDir },
		);
		await fs.access(outputFile);
	});
});
