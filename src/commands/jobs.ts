import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { searchJobs } from "../core/linkedin.js";
import { addCommonOptions, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";

interface JobSearchOpts extends CommonOpts {
  keywords: string;
  location?: string;
  remote: boolean;
  limit: string;
}

export function registerJobsCommands(program: Command): void {
  const jobs = program.command("jobs").description("Job search commands");

  const search = jobs
    .command("search")
    .description("Search for jobs by keyword")
    .requiredOption("--keywords <text>", "Keywords to search")
    .option("--location <text>", "Location filter")
    .option("--remote", "Filter for remote jobs only", false)
    .option("--limit <n>", "Max results", "10");

  addCommonOptions(search).action(async (opts: JobSearchOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start(`Searching jobs for "${opts.keywords}"...`);

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const results = await searchJobs(page, {
        keywords: opts.keywords,
        location: opts.location,
        remote: opts.remote,
        limit
      });
      progress.stop(`Found ${results.length} jobs.`);
      await outputResult(results, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
