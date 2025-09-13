# PDF Made Easy changelog

This project adheres to the
[Semantic Versioning 2.0 Specification](https://semver.org).

## Unreleased

### ⚠️ Breaking

- **This package no longer exports any functions and is now CLI only.**
- This package now only exports one type, `PMEUserConfig`, formerly `PMEConfig`.
- Walking up parent directories to find the default config file is no longer
  supported.
- Searching the user's home directory for the default config file is no longer
  supported.
- JSON, JSONC, and JSON5 are no longer supported as data file formats.
- Supplying a custom template renderer is no longer supported.

### ✨ New

- Config files can now also be `.js` or `.cjs`. If no config file is supplied
  via the `--config` or `-c` flag, it will now try to find `pme.config.js`,
  `pme.config.mjs`, and `pme.config.cjs` in the current working directory, in
  that order.
- `launchOptions` can now be set in the config file.

## 0.2.0 - February 01, 2023

### ⚠️ Breaking

#### Library

- `getDefaultTemplateRenderer` is no longer exported.
- `getTemplateRenderer` is now optional and is passed as part of `options`.

### ✨ New

#### CLI

- A custom template renderer can now be set in the config file.

### 🔧 Fixes

#### CLI

- The help command now shows `pme` as the script name instead of `cli.js` on
  Windows.

## 0.1.0 - January 26, 2023

- Initial release
