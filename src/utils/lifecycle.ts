import type { Browser } from "playwright";
import { logger } from "./logger.js";

const activeBrowsers = new Set<Browser>();

export function trackBrowser(browser: Browser): void {
  activeBrowsers.add(browser);
  browser.on("disconnected", () => {
    activeBrowsers.delete(browser);
  });
}

export function untrackBrowser(browser: Browser): void {
  activeBrowsers.delete(browser);
}

export async function cleanupAllBrowsers(): Promise<void> {
  const browsers = Array.from(activeBrowsers);
  activeBrowsers.clear();
  for (const browser of browsers) {
    try {
      await browser.close();
    } catch {
      // ignore close errors during cleanup
    }
  }
}

let signalHandlersInstalled = false;

export function installSignalHandlers(): void {
  if (signalHandlersInstalled) {
    return;
  }
  signalHandlersInstalled = true;

  const handler = (signal: string) => {
    logger.debug(`Received ${signal}, cleaning up browsers...`);
    cleanupAllBrowsers()
      .catch(() => {})
      .finally(() => {
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}
