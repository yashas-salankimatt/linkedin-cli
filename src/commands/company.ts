import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { getCompanyProfile } from "../core/linkedin.js";
import { getCached, setCache } from "../utils/cache.js";
import { loadConfig } from "../utils/config.js";
import { addCommonOptions, isCacheDisabled, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";
import type { CompanyResult } from "../core/linkedin.js";

interface CompanyOpts extends CommonOpts {
  url: string;
}

export function registerCompanyCommands(program: Command): void {
  const company = program.command("company").description("Company inspection commands");

  const get = company
    .command("get")
    .description("Get a LinkedIn company page summary")
    .requiredOption("--url <companyUrl>", "LinkedIn company URL or slug");

  addCommonOptions(get).action(async (opts: CompanyOpts) => {
    const format = resolveFormat(opts);
    const config = await loadConfig();
    const progress = new Progress();

    const urlForCache = opts.url.startsWith("http") ? opts.url : `https://www.linkedin.com/company/${opts.url}/`;

    // Check cache before launching browser
    if (!isCacheDisabled(opts) && config.cache.enabled) {
      const cached = await getCached<CompanyResult>("company", urlForCache);
      if (cached) {
        progress.start("Loading company profile...");
        progress.stop("Company loaded from cache.");
        await outputResult(cached, format, { template: opts.template, outputPath: opts.output });
        return;
      }
    }

    progress.start("Loading company profile...");
    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);

      const companyUrl = opts.url.startsWith("http") ? opts.url : `https://www.linkedin.com/company/${opts.url}/`;
      const result = await getCompanyProfile(page, companyUrl);

      if (!isCacheDisabled(opts) && config.cache.enabled) {
        await setCache("company", urlForCache, result, config.cache.ttlMinutes * 60 * 1000);
      }

      progress.stop("Company loaded.");
      await outputResult(result, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
