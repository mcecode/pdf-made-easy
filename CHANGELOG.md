# PDF Made Easy changelog

This project adheres to the [Semantic Versioning 2.0 Specification](https://semver.org).

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

- The help command now shows `pme` as the script name instead of `cli.js` on Windows.

## 0.1.0 - January 26, 2023

- Initial release
