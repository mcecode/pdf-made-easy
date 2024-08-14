import type { LiquidOptions } from "liquidjs/dist/liquid-options";
import type { Page, PDFOptions } from "puppeteer";

interface BaseOptions {
  /**
   * Path to YAML data file.
   */
  data: string;

  /**
   * Path to Liquid template file.
   */
  template: string;

  /**
   * Path to PDF output file.
   */
  output: string;
}

interface CLIOptions extends BaseOptions {
  /**
   * Path to config file.
   */
  config: string;
}

interface PMEUserConfig {
  /**
   * Options passed to the Liquid constructor.
   */
  liquidOptions?: LiquidOptions;

  /**
   * Options passed to Puppeteer's PDF renderer.
   */
  pdfOptions?: PDFOptions;
}

interface BuildOptions extends BaseOptions {
  /**
   * Options passed down to Liquid and Puppeteer.
   */
  options?: PMEUserConfig;
}

/**
 * Contains methods for rendering PDF files from data and template files.
 */
interface Builder {
  /**
   * Outputs a PDF file using data and template files.
   *
   * @param rootDir
   *   Defaults to `process.cwd()`. Prepended to the relative paths passed to
   *   `args` to find their absolute paths.
   */
  build(args: BuildOptions, rootDir?: string): Promise<void>;

  /**
   * Disposes all resources instantiated and turns {@link Builder.build} and
   * {@link Builder.close} into NOOP methods.
   */
  close(): Promise<void>;
}

/**
 * Contains methods for rendering PDF files from URLs.
 */
interface PDFRenderer {
  /**
   * Renders a PDF from the HTML found in `url`.
   *
   * @param options
   *   Options passed to Puppeteer's PDF renderer.
   *
   * @returns
   *   The rendered PDF.
   */
  render(url: string, options?: PDFOptions): ReturnType<Page["pdf"]>;

  /**
   * Disposes all resources instantiated and turns {@link PDFRenderer.render}
   * and {@link PDFRenderer.close} into NOOP methods.
   */
  close(): Promise<void>;
}
