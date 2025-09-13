#!/usr/bin/env node

import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { buildNonDefaultCommand, executeCommand } from "./lib.js";

await yargs()
	// Settings
	.scriptName("pme")
	.parserConfiguration({
		"boolean-negation": false,
		"dot-notation": false,
		"duplicate-arguments-array": false,
		"populate--": true,
		"strip-aliased": true,
		"strip-dashed": true,

		// In preparation for yargs version 19, see:
		// https://github.com/yargs/yargs-parser/pull/516
		"greedy-arrays": true,
	})
	.showHelpOnFail(false)
	.recommendCommands()
	.strict()

	// Usage
	.usage("$0")
	.usage("$0 [options]")
	.usage("$0 <command> [options]")

	// Commands
	.command({
		command: "$0",
		describe: "Same as 'dev' command",
		handler: executeCommand,
	})
	.command({
		builder: buildNonDefaultCommand,
		command: "dev",
		describe: "Watch data and template files and output PDF on change",
		handler: executeCommand,
	})
	.command({
		builder: buildNonDefaultCommand,
		command: "build",
		describe: "Output PDF using data and template files",
		handler: executeCommand,
	})

	// Options
	.alias({ help: "h", version: "v" })
	.options({
		config: {
			alias: "c",
			describe: "Path to JavaScript config file",
			type: "string",
		},
		data: {
			alias: "d",
			default: "data.yml",
			describe: "Path to YAML data file",
			type: "string",
		},
		output: {
			alias: "o",
			default: "output.pdf",
			describe: "Path to PDF output file",
			type: "string",
		},
		template: {
			alias: "t",
			default: "template.liquid",
			describe: "Path to Liquid template file",
			type: "string",
		},
	})

	// Examples
	.example([
		["$0"],
		["$0 -d info.yml"],
		["$0 dev -t ./templates/default.liquid"],
		["$0 build -o /home/user/document.pdf"],
		["$0 -d info.yml -t ./templates/default.liquid -o /home/user/document.pdf"],
	])

	// Parse and execute
	.parse(hideBin(process.argv));
