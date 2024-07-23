#!/usr/bin/env node

import nodePath from "node:path";
import os from "node:os";
import url from "node:url";

import { findUp, pathExists } from "find-up";
import { hideBin } from "yargs/helpers";
import yargs from "yargs/yargs";

import { absolutizePath, build, develop } from "./index.js";

const DEFAULT_CONFIG_FILENAME = "pme.config.mjs";

const cli = yargs();

// Settings
cli
  .scriptName("pme")
  .parserConfiguration({
    "boolean-negation": false,
    "dot-notation": false,
    "duplicate-arguments-array": false,
    "populate--": true,
    "strip-aliased": true,
    "strip-dashed": true,
    // In preparation for yargs-parser version 18, see:
    // https://github.com/yargs/yargs-parser#greedy-arrays
    "greedy-arrays": true
  })
  .showHelpOnFail(false)
  .recommendCommands()
  .strict();

// Usage
cli.usage("$0").usage("$0 [options]").usage("$0 <command> [options]");

// Commands
cli
  .command({
    command: "$0",
    describe: "Same as 'dev' command",
    handler: handle
  })
  .command({
    command: "dev",
    describe: "Watch data and template files and output PDF on change",
    builder: buildNonDefaultCommand,
    handler: handle
  })
  .command({
    command: "build",
    describe: "Output PDF using data and template files",
    builder: buildNonDefaultCommand,
    handler: handle
  });

/**
 * Disables version option for non-default commands.
 *
 * @param {import("yargs").Argv} y
 */
function buildNonDefaultCommand(y) {
  return y.version(false);
}

/**
 * @param {import("yargs").ArgumentsCamelCase<import("./index").PMEArgs>} args
 */
async function handle(args) {
  const {
    _: [command],
    config
  } = args;

  try {
    await (command === "build" ? build : develop)({
      ...args,
      options: await getConfig(config, DEFAULT_CONFIG_FILENAME)
    });
  } catch ({ message }) {
    console.error(`Error: ${message}`);
  }
}

/**
 * @param {string} path
 * @param {string} defaultConfigFilename
 * @returns {Promise<object>}
 */
async function getConfig(path, defaultConfigFilename) {
  if (nodePath.extname(path) !== ".mjs") {
    throw new Error(
      "Config file must be a .mjs ESM module, " +
        `'${nodePath.basename(path)}' given`
    );
  }

  let config;

  if (path === defaultConfigFilename) {
    config = (await findUp(path)) ?? nodePath.join(os.homedir(), path);

    return (await pathExists(config)) ? importDefault(config) : {};
  }

  config = absolutizePath(path);

  if (!(await pathExists(config))) {
    throw new Error(`Config file '${config}' does not exist`);
  }

  return importDefault(config);
}

/**
 * @param {string} path
 * @returns {Promise<object>}
 */
async function importDefault(path) {
  const mod = await import(url.pathToFileURL(path).href);

  if (typeof mod.default === "undefined") {
    throw new Error(`Config file '${path}' does not have a default export`);
  }

  if (typeof mod.default !== "object") {
    throw new TypeError(
      "Config file should have an object default export, " +
        `exported '${typeof mod.default}'`
    );
  }

  if (mod.default === null) {
    throw new TypeError(
      "Config file should have an object default export, exported 'null'"
    );
  }

  return mod.default;
}

// Options
cli.alias({ help: "h", version: "v" }).options({
  config: {
    alias: "c",
    describe: "Path to MJS config file",
    type: "string",
    default: DEFAULT_CONFIG_FILENAME
  },
  data: {
    alias: "d",
    describe: "Path to YAML data file",
    type: "string",
    default: "data.yml"
  },
  template: {
    alias: "t",
    describe: "Path to Liquid template file",
    type: "string",
    default: "template.liquid"
  },
  output: {
    alias: "o",
    describe: "Path to PDF output file",
    type: "string",
    default: "output.pdf"
  }
});

// Examples
cli.example([
  ["$0"],
  ["$0 -d info.yml"],
  ["$0 dev -t ./templates/default.liquid"],
  ["$0 build -o /home/user/document.pdf"],
  ["$0 -d info.yml -t ./templates/default.liquid -o /home/user/document.pdf"]
]);

// Parse and execute
cli.parse(hideBin(process.argv));
