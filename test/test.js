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

await describe("cli.js", async () => {
	await it("creates valid PDF file with correct info using no config", async (ctx) => {
		const command = "build";
		const type = "complex-input-no-config";

		const cwd = path.join(testDir, "fixtures", command, type);
		const output = path.join(cwd, "output.pdf");
		await deleteFile(output);

		await execFile("node", [cliFile, command], { cwd });

		ctx.assert.snapshot(await getPDFInfo(output));
	});

	await it("creates valid PDF with correct text using default config", async (ctx) => {
		const command = "build";
		const type = "simple-input-default-config";

		const cwd = path.join(testDir, "fixtures", command, type);
		const output = path.join(cwd, "output.pdf");
		await deleteFile(output);

		await execFile("node", [cliFile, command], { cwd });

		ctx.assert.snapshot(await getPDFText(output));
	});
});
