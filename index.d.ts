import type { LiquidOptions } from "liquidjs/dist/liquid-options";
import type { PDFOptions, PuppeteerLaunchOptions } from "puppeteer";

export interface PMEUserConfig {
  /**
   * Options passed to the Liquid constructor.
   * @see {@link https://liquidjs.com/api/interfaces/LiquidOptions.html}
   */
  liquidOptions?: LiquidOptions;

  /**
   * Options passed to Puppeteer when it generates a PDF.
   * @see {@link https://pptr.dev/api/puppeteer.pdfoptions}
   */
  pdfOptions?: PDFOptions;
}
