#!/usr/bin/env node
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerBatchCommands } from "./commands/batch.js";
import { registerCompanyCommands } from "./commands/company.js";
import { registerConnectCommands } from "./commands/connect.js";
import { registerJobsCommands } from "./commands/jobs.js";
import { registerMessageCommands } from "./commands/message.js";
import { registerNetworkCommands } from "./commands/network.js";
import { registerPostsCommands } from "./commands/posts.js";
import { registerProfileCommands } from "./commands/profile.js";
import { registerSearchCommands } from "./commands/search.js";
import { registerUrlCommands } from "./commands/url.js";
import { loadConfig } from "./utils/config.js";
import { setDelayRange } from "./utils/delay.js";
import { installSignalHandlers } from "./utils/lifecycle.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  installSignalHandlers();

  const program = new Command();

  program
    .name("linkedin")
    .description("LinkedIn CLI (browser-backed)")
    .version("0.2.0")
    .option("-v, --verbose", "Enable verbose debug logging")
    .showHelpAfterError()
    .hook("preAction", async (thisCommand) => {
      const globalOpts = thisCommand.optsWithGlobals();
      if (globalOpts.verbose) {
        logger.verbose = true;
      }

      // Load config and apply delay range
      const config = await loadConfig();
      if (config.verbose) {
        logger.verbose = true;
      }
      setDelayRange(config.delay.minMs, config.delay.maxMs);
    });

  registerAuthCommands(program);
  registerSearchCommands(program);
  registerProfileCommands(program);
  registerPostsCommands(program);
  registerNetworkCommands(program);
  registerCompanyCommands(program);
  registerJobsCommands(program);
  registerMessageCommands(program);
  registerConnectCommands(program);
  registerBatchCommands(program);
  registerUrlCommands(program);

  await program.parseAsync();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
