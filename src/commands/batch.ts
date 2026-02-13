import fs from "node:fs/promises";
import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { getDetailedProfile, getProfile } from "../core/linkedin.js";
import { getCached, setCache } from "../utils/cache.js";
import { loadConfig } from "../utils/config.js";
import { addCommonOptions, isCacheDisabled, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";
import { randomDelay } from "../utils/delay.js";
import type { DetailedProfileResult, ProfileResult } from "../core/linkedin.js";

interface BatchProfileOpts extends CommonOpts {
  file: string;
  limit: string;
  detailed: boolean;
}

export function registerBatchCommands(program: Command): void {
  const batch = program.command("batch").description("Batch operations over URL lists");

  const profiles = batch
    .command("profiles")
    .description("Scrape multiple profiles from a file (one URL per line)")
    .requiredOption("--file <path>", "Path to file with profile URLs (one per line)")
    .option("--limit <n>", "Max profiles to process", "100")
    .option("--detailed", "Include experience, education, and skills", false);

  addCommonOptions(profiles).action(async (opts: BatchProfileOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const config = await loadConfig();

    let raw: string;
    try {
      raw = await fs.readFile(opts.file, "utf8");
    } catch {
      throw new Error(`Cannot read file: ${opts.file}`);
    }
    const urls = [
      ...new Set(
        raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
      )
    ].slice(0, limit);

    if (urls.length === 0) {
      console.error("No URLs found in file.");
      return;
    }

    const progress = new Progress();
    progress.start(`Processing 0/${urls.length} profiles...`);

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);

      const results: Array<ProfileResult | DetailedProfileResult> = [];
      const failures: Array<{ url: string; error: string }> = [];

      for (const [index, url] of urls.entries()) {
        progress.update(`Processing ${index + 1}/${urls.length}: ${url.slice(0, 60)}...`);

        // Check cache
        const cacheKey = `${url}:${opts.detailed ? "detailed" : "basic"}`;
        if (!isCacheDisabled(opts) && config.cache.enabled) {
          const cached = await getCached<ProfileResult | DetailedProfileResult>("profile", cacheKey);
          if (cached) {
            results.push(cached);
            continue;
          }
        }

        try {
          const result = opts.detailed ? await getDetailedProfile(page, url) : await getProfile(page, url);
          results.push(result);

          if (!isCacheDisabled(opts) && config.cache.enabled) {
            await setCache("profile", cacheKey, result, config.cache.ttlMinutes * 60 * 1000);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`Failed to scrape ${url}: ${message}`);
          failures.push({ url, error: message });
        }

        // Rate limit between profiles
        if (index < urls.length - 1) {
          await randomDelay(config.delay.minMs, config.delay.maxMs);
        }
      }

      progress.stop(`Processed ${results.length}/${urls.length} profiles.${failures.length > 0 ? ` ${failures.length} failed.` : ""}`);

      const payload = failures.length > 0 ? { results, failures } : results;
      await outputResult(payload, format, { template: opts.template, outputPath: opts.output });

      if (failures.length > 0) {
        process.exitCode = 1;
      }
    } finally {
      await browser.close();
    }
  });
}
