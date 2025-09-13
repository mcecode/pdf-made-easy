/**
 * @typedef PMEUserConfig
 *
 * @property {import("puppeteer").LaunchOptions} [launchOptions]
 *   Options passed to Puppeteer when it launches a browser instance.
 *
 *   {@link https://pptr.dev/api/puppeteer.launchoptions}
 *
 * @property {import("liquidjs").LiquidOptions} [liquidOptions]
 *   Options passed to the Liquid constructor.
 *
 *   {@link https://liquidjs.com/api/interfaces/LiquidOptions.html}
 *
 * @property {import("puppeteer").PDFOptions} [pdfOptions]
 *   Options passed to Puppeteer when it generates a PDF.
 *
 *   {@link https://pptr.dev/api/puppeteer.pdfoptions}
 */

const validKeys = ["launchOptions", "liquidOptions", "pdfOptions"];

/**
 * A helper for defining config objects.
 *
 * @param {PMEUserConfig} config
 *
 * @throws {TypeError}
 *   If provided an argument that is not an object or if the object argument
 *   contains invalid keys.
 *
 * @returns {PMEUserConfig}
 */
export function defineConfig(config) {
  if (Object.prototype.toString.call(config) !== "[object Object]") {
    throw new TypeError("invalid config provided");
  }

  const keys = Object.keys(config);
  if (new Set([...validKeys, ...keys]).size > validKeys.length) {
    throw new TypeError("invalid config key provided");
  }

  return config;
}
