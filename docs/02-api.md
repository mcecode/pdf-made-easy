# API

**Note:** PDF Made Easy is [ECMAScript modules only](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c), meaning, it can only be `import`ed, not `require`d.

The full documentation for PDF Made Easy's API is yet to be written. However, for now, [intellisense](https://en.wikipedia.org/wiki/Intelligent_code_completion) and the [library's declaration file](../index.d.ts) would probably give you a good enough idea of how to use it.

For most use cases where a customized script is needed, the `Builder` object will likely suffice. Below is an example of how to use it:

```js
import Handlebars from "handlebars";
import { getBuilder, getDefaultTemplateRenderer } from "pdf-made-easy";

// Instantiates the 'Builder' object and resources needed for PDF generation.
const builder = await getBuilder();

// Generate a PDF from 'template.liquid' with data injected from 'data.yml' and
// emit it to an 'output.pdf' file.
// Relative file paths will be resolved in the current working directory.
// 'getDefaultTemplateRenderer' returns the default template renderer which
// uses Liquid.
await builder.build({
  data: "data.yml",
  template: "template.liquid",
  output: "output.pdf",
  getTemplateRenderer: getDefaultTemplateRenderer
});

// Use a JSON data file.
await builder.build({
  data: "data.json",
  template: "template.liquid",
  output: "output.pdf",
  getTemplateRenderer: getDefaultTemplateRenderer
});

// Resolve relative file paths in a custom directory.
await builder.build(
  {
    data: "data.yml",
    template: "template.liquid",
    output: "output.pdf",
    getTemplateRenderer: getDefaultTemplateRenderer
  },
  "/my/custom/root/directory/where/relative/paths/will/be/resolved/in"
);

// Use Handlebars as the templating engine.
await builder.build({
  data: "data.yml",
  template: "template.hbs",
  output: "output.pdf",
  getTemplateRenderer(options) {
    return (template, data) => Handlebars.compile(template, options)(data);
  }
});

// Pass options to the templating engine and the PDF renderer.
await builder.build({
  data: "data.yml",
  template: "template.liquid",
  output: "output.pdf",
  getTemplateRenderer: getDefaultTemplateRenderer,
  options: {
    templateOptions: {
      // ...
    },
    pdfOptions: {
      // ...
    }
  }
});

// Dispose all instatiated resouces so the script can exit.
await builder.close();
```
