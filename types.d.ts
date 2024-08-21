import type { LiquidOptions } from "liquidjs/dist/liquid-options";
import type { PDFOptions } from "puppeteer";

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
   */
  build(args: BuildOptions): Promise<void>;

  /**
   * Disposes all resources instantiated and turns {@link Builder.build} and
   * {@link Builder.close} into NOOP methods.
   */
  close(): Promise<void>;
}
