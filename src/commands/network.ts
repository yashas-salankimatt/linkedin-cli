import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { getMutualConnections, getWarmIntroPaths, listConnections } from "../core/linkedin.js";
import { addCommonOptions, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";

interface NetworkCommonOpts extends CommonOpts {
  target: string;
  limit: string;
}

interface ConnectionsOpts extends CommonOpts {
  limit: string;
}

export function registerNetworkCommands(program: Command): void {
  const network = program.command("network").description("Relationship graph and intro path tools");

  const mutuals = network
    .command("mutuals")
    .description("Get mutual connections for a target profile URL")
    .requiredOption("--target <profileUrl>", "Target LinkedIn profile URL")
    .option("--limit <n>", "Max mutuals to collect", "200");

  addCommonOptions(mutuals).action(async (opts: NetworkCommonOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start("Collecting mutual connections...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const results = await getMutualConnections(page, opts.target, limit);
      const payload = {
        targetProfileUrl: opts.target,
        count: results.length,
        mutuals: results
      };
      progress.stop(`Found ${results.length} mutual connections.`);
      await outputResult(payload, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });

  const warmPaths = network
    .command("warm-paths")
    .description("Rank warm intro paths from you to target via mutual connections")
    .requiredOption("--target <profileUrl>", "Target LinkedIn profile URL")
    .option("--limit <n>", "Max paths to return", "200");

  addCommonOptions(warmPaths).action(async (opts: NetworkCommonOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start("Analyzing warm intro paths...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const paths = await getWarmIntroPaths(page, opts.target, limit);
      const payload = {
        targetProfileUrl: opts.target,
        count: paths.length,
        paths
      };
      progress.stop(`Found ${paths.length} warm intro paths.`);
      await outputResult(payload, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });

  const connections = network
    .command("connections")
    .description("Export your 1st-degree connection list")
    .option("--limit <n>", "Max connections to collect", "500");

  addCommonOptions(connections).action(async (opts: ConnectionsOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start("Exporting connections...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const results = await listConnections(page, limit);
      progress.stop(`Exported ${results.length} connections.`);
      await outputResult(results, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
