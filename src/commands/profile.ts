import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { getDetailedProfile, getProfile, resolveMyProfileUrl, screenshotProfile } from "../core/linkedin.js";
import { getCached, setCache } from "../utils/cache.js";
import { loadConfig } from "../utils/config.js";
import { addCommonOptions, isCacheDisabled, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";
import type { DetailedProfileResult, ProfileResult } from "../core/linkedin.js";

interface ProfileOpts extends CommonOpts {
  url?: string;
  detailed: boolean;
  screenshot?: string;
}

export function registerProfileCommands(program: Command): void {
  const profile = program.command("profile").description("Profile inspection commands");

  const get = profile
    .command("get")
    .description("Get a LinkedIn profile summary (defaults to your own)")
    .option("--url <profileUrl>", "Target profile URL")
    .option("--detailed", "Include experience, education, and skills", false)
    .option("--screenshot <path>", "Save a full-page screenshot to the given path");

  addCommonOptions(get).action(async (opts: ProfileOpts) => {
    const format = resolveFormat(opts);
    const config = await loadConfig();
    const progress = new Progress();

    // For cache check, we need the resolved URL. If --url is provided, we can check
    // cache before launching a browser. If not, we need the browser to resolve "me".
    if (opts.url && !isCacheDisabled(opts) && config.cache.enabled && !opts.screenshot) {
      const cacheKey = `${opts.url}:${opts.detailed ? "detailed" : "basic"}`;
      const cached = await getCached<ProfileResult | DetailedProfileResult>("profile", cacheKey);
      if (cached) {
        progress.start("Loading profile...");
        progress.stop("Profile loaded from cache.");
        await outputResult(cached, format, { template: opts.template, outputPath: opts.output });
        return;
      }
    }

    progress.start("Loading profile...");
    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const profileUrl = opts.url ? opts.url : await resolveMyProfileUrl(page);

      // Cache check (for resolved "me" URL or when screenshot is needed)
      const cacheKey = `${profileUrl}:${opts.detailed ? "detailed" : "basic"}`;
      if (!isCacheDisabled(opts) && config.cache.enabled) {
        const cached = await getCached<ProfileResult | DetailedProfileResult>("profile", cacheKey);
        if (cached) {
          progress.stop("Profile loaded from cache.");
          await outputResult(cached, format, { template: opts.template, outputPath: opts.output });

          if (opts.screenshot) {
            try {
              await screenshotProfile(page, profileUrl, opts.screenshot);
              console.error(`Screenshot saved to ${opts.screenshot}`);
            } catch (err) {
              console.error(`Failed to save screenshot: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          return;
        }
      }

      const result = opts.detailed ? await getDetailedProfile(page, profileUrl) : await getProfile(page, profileUrl);

      if (!isCacheDisabled(opts) && config.cache.enabled) {
        await setCache("profile", cacheKey, result, config.cache.ttlMinutes * 60 * 1000);
      }

      progress.stop("Profile loaded.");
      await outputResult(result, format, { template: opts.template, outputPath: opts.output });

      if (opts.screenshot) {
        try {
          await screenshotProfile(page, profileUrl, opts.screenshot);
          console.error(`Screenshot saved to ${opts.screenshot}`);
        } catch (err) {
          console.error(`Failed to save screenshot: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
