import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { sendConnectionRequest } from "../core/linkedin.js";
import { addCommonOptions, type CommonOpts } from "../utils/options.js";
import { Progress } from "../utils/progress.js";

interface ConnectOpts extends CommonOpts {
  to: string;
  note?: string;
}

export function registerConnectCommands(program: Command): void {
  const connect = program
    .command("connect")
    .description("Send a connection request (use responsibly)")
    .requiredOption("--to <profileUrl>", "Target LinkedIn profile URL")
    .option("--note <text>", "Optional personalized note to include");

  addCommonOptions(connect).action(async (opts: ConnectOpts) => {
    console.error("Warning: Automated connection requests may violate LinkedIn's Terms of Service. Use responsibly.");
    const progress = new Progress();
    progress.start("Sending connection request...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      await sendConnectionRequest(page, opts.to, opts.note);
      progress.stop("Connection request sent.");
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
