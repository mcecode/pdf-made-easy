import type { LiquidOptions } from "liquidjs";
import type { LaunchOptions, PDFOptions } from "puppeteer";

export interface PMEUserConfig {
  /**
   * Options passed to the Liquid constructor.
   *
   * @see {@link https://liquidjs.com/api/interfaces/LiquidOptions.html}
   */
  liquidOptions?: LiquidOptions;

  /**
   * Options passed to Puppeteer when it generates a PDF.
   *
   * @see {@link https://pptr.dev/api/puppeteer.pdfoptions}
   */
  pdfOptions?: PDFOptions;

  /**
   * Options passed to Puppeteer when it launches a browser instance.
   *
   * @see {@link https://pptr.dev/api/puppeteer.launchoptions}
   */
  launchOptions?: LaunchOptions;
}
