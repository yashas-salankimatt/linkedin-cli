import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { searchPeople } from "../core/linkedin.js";
import { addCommonOptions, collectNetwork, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";

interface SearchOpts extends CommonOpts {
  keywords: string;
  network: Array<"1" | "2" | "3">;
  location?: string;
  limit: string;
}

export function registerSearchCommands(program: Command): void {
  const search = program.command("search").description("Search LinkedIn entities");

  const people = search
    .command("people")
    .description("Search people by keyword and optional filters")
    .requiredOption("--keywords <text>", "Keywords to search")
    .option("--network <degree>", "Connection degree filter (1|2|3). Repeat for multiple.", collectNetwork, [])
    .option("--location <text>", "Location text filter")
    .option("--limit <n>", "Max results", "10");

  addCommonOptions(people).action(async (opts: SearchOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start(`Searching for "${opts.keywords}"...`);

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const results = await searchPeople(page, {
        keywords: opts.keywords,
        network: opts.network,
        location: opts.location,
        limit
      });
      progress.stop(`Found ${results.length} results.`);
      await outputResult(results, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
