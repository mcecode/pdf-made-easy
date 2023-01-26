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

The CLI can be configured using an [ECMAScript module](https://nodejs.org/api/esm.html) config file with a `.mjs` extension. By default, it will search for a file named `pme.config.mjs` in the current working directory. If not found, it will continue searching for this file up the directory tree. If there is no `pme.config.mjs` file found in the directory tree, it will try to look for it in the home directory. Alternatively, you can pass the path to a config file using the `--config` or `-c` option.

If present, the config file is expected to have a default object export with the following optional properties:

- [`templateOptions`](https://liquidjs.com/api/interfaces/liquid_options_.liquidoptions.html), this will be passed to the template renderer, which is [Liquid](https://liquidjs.com).
- [`pdfOptions`](https://pptr.dev/api/puppeteer.pdfoptions), this will be passed to the PDF renderer, which is [Puppeteer](https://pptr.dev).

Below is an example of a config file:

```js
/** @type {import("pdf-made-easy").PMEConfig} */
export default {
  templateOptions: {
    // ...
  },
  pdfOptions: {
    // ...
  }
};
```

The [JSDoc](https://jsdoc.app) `@type` comment helps to provide [code completion](https://en.wikipedia.org/wiki/Intelligent_code_completion) when using editors that support loading [declaration files](https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html).
