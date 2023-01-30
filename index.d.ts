import { LiquidOptions } from "liquidjs/dist/liquid-options";
import { PDFOptions } from "puppeteer";

export interface BaseArgs {
  /**
   * The path to the YAML or JSON data file.
   */
  data: string;

  /**
   * The path to the template file.
   */
  template: string;

  /**
   * The path to the PDF output file.
   */
  output: string;
}

/**
 * The arguments passed to the CLI.
 */
export interface PMEArgs extends BaseArgs {
  /**
   * The path to the MJS config file with a default export that conforms to
   * {@link PMEConfig}.
   */
  config: string;
}

/**
 * The CLI config file settings which are passed down to {@link Builder.build},
 * {@link build}, and {@link develop} through {@link CommandArgs.options}.
 */
export interface PMEConfig<T = LiquidOptions> {
  /**
   * The options passed to {@link CommandArgs.getTemplateRenderer}.
   */
  templateOptions?: T;

  /**
   * The options passed to {@link PDFRenderer.render}.
   */
  pdfOptions?: PDFOptions;

  /**
   * Sets up and returns a function that renders HTML from a template string and data
   * object.
   */
  getTemplateRenderer?(options?: T): RenderTemplate;
}

/**
 * The arguments passed to {@link Builder.build}, {@link build}, and
 * {@link develop}.
 */
export interface CommandArgs<T = LiquidOptions> extends BaseArgs {
  /**
   * The options passed down to the template and PDF renderers.
   */
  options?: PMEConfig<T>;
}

/**
 * Instantiates resources needed for PDF generation, then watches data and
 * template files for changes and outputs a PDF file on change.
 *
 * @param rootDir Defaults to `process.cwd()`. The directory watched for changes
 * to trigger re-emmiting the PDF file on change. Prepended to the relative
 * paths passed to `args` to find their absolute paths.
 * @returns A cleanup function that disposes all resources instantiated.
 */
export function develop<T = LiquidOptions>(
  args: CommandArgs<T>,
  rootDir?: string
): Promise<() => Promise<void>>;

/**
 * Instantiates resources needed for PDF generation, outputs a PDF file using
 * data and template files, then disposes all resources instantiated.
 *
 * @param rootDir Defaults to `process.cwd()`. Prepended to the relative paths
 * passed to `args` to find their absolute paths.
 */
export function build<T = LiquidOptions>(
  args: CommandArgs<T>,
  rootDir?: string
): Promise<void>;

/**
 * Contains methods for rendering PDF files from data and template files.
 */
export interface Builder {
  /**
   * Outputs a PDF file using data and template files.
   *
   * @param rootDir Defaults to `process.cwd()`. Prepended to the relative paths
   * passed to `args` to find their absolute paths.
   */
  build<T = LiquidOptions>(
    args: CommandArgs<T>,
    rootDir?: string
  ): Promise<void>;

  /**
   * Disposes all resources instantiated by {@link getBuilder} and turns
   * {@link Builder.build} and {@link Builder.close} into dummy methods.
   */
  close(): Promise<void>;
}

/**
 * Instantiates resources needed for PDF generation then returns a
 * {@link Builder} object.
 */
export function getBuilder(): Promise<Builder>;

/**
 * Reads the contents of the YAML, JSON, JSONC, or JSON5 file in `path` then
 * returns its JavaScript representation.
 */
export function getData(path: string): Promise<any>;

/**
 * Parses `data` then returns its JavaScript representation.
 *
 * @param type The type of the data to be parsed.
 */
export function parseData(data: string, type?: "yaml" | "json"): any;

/**
 * @param template The template to render.
 * @param data The data to populate the template with.
 * @returns The rendered template.
 */
export interface RenderTemplate {
  (template: string, data?: object): string | Promise<string>;
}

/**
 * Renders HTML from the template found in `path` using the `render` function
 * and `data` object passed.
 *
 * Due to this function's signature, it can theoretically render any format.
 * However, it is intended to only render HTML in this context.
 *
 * @returns The rendered HTML.
 */
export function renderHTML(
  path: string,
  render: RenderTemplate,
  data?: object
): Promise<string>;

/**
 * @returns The default Liquid renderer.
 */
export function getDefaultTemplateRenderer(
  options?: LiquidOptions
): RenderTemplate;

/**
 * Encodes `html` into a Data URL.
 *
 * @returns The HTML Data URL.
 */
export function encodeHTML(html: string): string;

/**
 * Contains methods for rendering PDF files from URLs.
 */
export interface PDFRenderer {
  /**
   * Renders a PDF from the HTML found in `url`.
   *
   * @returns The rendered PDF.
   */
  render(url: string, options?: PDFOptions): Promise<Buffer>;

  /**
   * Disposes all resources instantiated by {@link getPDFRenderer} and turns
   * {@link PDFRenderer.render} and {@link PDFRenderer.close} into dummy
   * methods.
   */
  close(): Promise<void>;
}

/**
 * Instantiates resources needed for PDF generation then returns a
 * {@link PDFRenderer} object.
 */
export function getPDFRenderer(): Promise<PDFRenderer>;

/**
 * Absolutizes `path` by joining it to `rootDir` then normalizes the output.
 * Returns a normalized `path` if it is already an absolute path.
 *
 * @param rootDir Defaults to `process.cwd()`.
 */
export function absolutizePath(path: string, rootDir?: string): string;
