# CLI

```console
pme
pme [options]
pme <command> [options]

Commands:
  pme        Same as 'dev' command                                     [default]
  pme dev    Watch data and template files and output PDF on change
  pme build  Output PDF using data and template files

Options:
  -h, --help      Show help                                            [boolean]
  -c, --config    Path to MJS config file   [string] [default: "pme.config.mjs"]
  -d, --data      Path to YAML or JSON data file  [string] [default: "data.yml"]
  -t, --template  Path to template file    [string] [default: "template.liquid"]
  -o, --output    Path to PDF output file       [string] [default: "output.pdf"]
  -v, --version   Show version number                                  [boolean]

Examples:
  pme
  pme -d data.json
  pme dev -t ./templates/default.liquid
  pme build -o /home/user/document.pdf
  pme -d data.json -t ./templates/default.liquid -o /home/user/document.pdf
```

## Configuration

The CLI can optionally be configured using an [ECMAScript module](https://nodejs.org/api/esm.html) config file with a `.mjs` extension. By default, it will search for a file named `pme.config.mjs` in the current working directory. If not found, it will continue searching for this file up the directory tree. If there is no `pme.config.mjs` file found in the directory tree, it will try to look for it in the home directory. Alternatively, you can pass the path to a config file using the `--config` or `-c` option.

### Options

If present, the config file is expected to have a default object export with the following optional properties and methods:

#### `templateOptions`

- Type: `object | undefined`
- Description: Options passed to the template renderer
- [Default template renderer options reference](https://liquidjs.com/api/interfaces/liquid_options_.liquidoptions.html)

#### `pdfOptions`

- Type: `object | undefined`
- Description: Options passed to the PDF renderer
- [PDF renderer options reference](https://pptr.dev/api/puppeteer.pdfoptions)

#### `getTemplateRenderer`

- Type: `function | undefined`
- Description: Returns a custom template renderer using the options passed from `templateOptions`
- Signature: `(options?) => (template: string, data?: object) => string | Promise<string>`

### Examples

**Tip:** If PDF Made Easy is installed locally or a global install is [`npm link`ed](https://docs.npmjs.com/cli/v9/commands/npm-link), you can add a [JSDoc](https://jsdoc.app) `@type` comment for [IntelliSense](https://en.wikipedia.org/wiki/Intelligent_code_completion) like in the examples below.

#### Passing options to the template and PDF renderers

```js
/** @type {import("pdf-made-easy").PMEConfig} */
export default {
  templateOptions: {
    jsTruthy: true,
    globals: {
      custom: "global variables here"
    }
  },
  pdfOptions: {
    format: "LEGAL",
    landscape: true,
    margin: {
      top: "0.5in",
      bottom: "0.5in",
      left: "1in",
      right: "1in"
    }
  }
};
```

#### Using a custom template renderer

```js
import Handlebars from "handlebars";

/**
 * @type {import("pdf-made-easy").PMEConfig<Parameters<Handlebars.compile>[1]>}
 */
export default {
  // 'templateOptions' will be passed to the 'getTemplateRenderer' method below
  // as 'options'.
  templateOptions: {
    noEscape: true,
    strict: true
  },
  getTemplateRenderer(options) {
    return (template, data) => Handlebars.compile(template, options)(data);
  }
};
```
