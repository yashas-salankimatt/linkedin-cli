import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { listMessages, sendMessage } from "../core/linkedin.js";
import { addCommonOptions, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";

interface MessageListOpts extends CommonOpts {
  limit: string;
}

interface MessageSendOpts extends CommonOpts {
  to: string;
  text: string;
}

export function registerMessageCommands(program: Command): void {
  const message = program.command("message").description("LinkedIn messaging (use responsibly)");

  const list = message
    .command("list")
    .description("List recent message threads")
    .option("--limit <n>", "Max threads to show", "20");

  addCommonOptions(list).action(async (opts: MessageListOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);
    const progress = new Progress();
    progress.start("Loading messages...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const results = await listMessages(page, limit);
      progress.stop(`Found ${results.length} message threads.`);
      await outputResult(results, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });

  const send = message
    .command("send")
    .description("Send a message to a LinkedIn profile (use responsibly)")
    .requiredOption("--to <profileUrl>", "Target LinkedIn profile URL")
    .requiredOption("--text <message>", "Message text to send");

  addCommonOptions(send).action(async (opts: MessageSendOpts) => {
    console.error("Warning: Automated messaging may violate LinkedIn's Terms of Service. Use responsibly.");
    const progress = new Progress();
    progress.start("Sending message...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      await sendMessage(page, opts.to, opts.text);
      progress.stop("Message sent successfully.");
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
