import { chromium, firefox, webkit, type Browser, type BrowserContext, type BrowserType, type Page } from "playwright";
import { logger } from "../utils/logger.js";
import { trackBrowser } from "../utils/lifecycle.js";
import { checkSessionExpiry, getStorageStatePath, sessionExists } from "./session.js";

export type SupportedBrowser = "chromium" | "firefox" | "webkit";

function getLauncher(browser: SupportedBrowser): BrowserType {
  if (browser === "firefox") {
    return firefox;
  }
  if (browser === "webkit") {
    return webkit;
  }
  return chromium;
}

export async function launchBrowser(browser: SupportedBrowser, headless: boolean): Promise<Browser> {
  logger.debug(`Launching ${browser} (headless=${headless})`);
  const launcher = getLauncher(browser);
  const instance = await launcher.launch({ headless });
  trackBrowser(instance);
  return instance;
}

export async function launchAuthenticatedContext(
  browser: SupportedBrowser,
  headless: boolean
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  if (!(await sessionExists())) {
    throw new Error("No LinkedIn session found. Run `linkedin auth login` or `linkedin auth import-cookies` first.");
  }

  await checkSessionExpiry();

  const launchedBrowser = await launchBrowser(browser, headless);
  try {
    const context = await launchedBrowser.newContext({
      storageState: getStorageStatePath(),
      viewport: { width: 1400, height: 1000 }
    });
    const page = await context.newPage();

    return {
      browser: launchedBrowser,
      context,
      page
    };
  } catch (error) {
    await launchedBrowser.close();
    throw error;
  }
}

export async function assertAuthenticated(page: Page): Promise<void> {
  logger.debug("Checking authentication status...");
  const currentUrl = page.url();
  // Skip navigation if already on a LinkedIn page (not on login/checkpoint)
  if (currentUrl.includes("linkedin.com") && !currentUrl.includes("/login") && !currentUrl.includes("/checkpoint") && currentUrl !== "about:blank") {
    logger.debug("Already on LinkedIn, skipping auth check navigation.");
    return;
  }
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });
  const url = page.url();
  if (url.includes("/login") || url.includes("/checkpoint")) {
    throw new Error("LinkedIn session is not authenticated. Run `linkedin auth login` again.");
  }
  logger.debug("Authentication confirmed.");
}
