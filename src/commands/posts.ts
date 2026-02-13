import { Command } from "commander";
import { assertAuthenticated, launchAuthenticatedContext } from "../core/browser.js";
import { listPosts, resolveMyProfileUrl } from "../core/linkedin.js";
import { untrackBrowser } from "../utils/lifecycle.js";
import { addCommonOptions, parsePositiveInt, resolveFormat, type CommonOpts } from "../utils/options.js";
import { outputResult } from "../utils/output.js";
import { Progress } from "../utils/progress.js";

interface PostsOpts extends CommonOpts {
  profile: string;
  limit: string;
  engagement: boolean;
  watch?: string;
}

export function registerPostsCommands(program: Command): void {
  const posts = program.command("posts").description("Post inspection commands");

  const list = posts
    .command("list")
    .description("List recent posts from a profile")
    .option("--profile <profileUrlOrMe>", "Profile URL or 'me'", "me")
    .option("--limit <n>", "Max posts", "10")
    .option("--engagement", "Include reaction and comment counts", false)
    .option("--watch <intervalMinutes>", "Poll for new posts at interval (in minutes)");

  addCommonOptions(list).action(async (opts: PostsOpts) => {
    const limit = parsePositiveInt(opts.limit, "--limit");
    const format = resolveFormat(opts);

    if (opts.watch) {
      const intervalMinutes = parsePositiveInt(opts.watch, "--watch");
      const intervalMs = intervalMinutes * 60 * 1000;
      const maxConsecutiveErrors = 3;

      console.error(`Watching for new posts every ${intervalMinutes} minute(s). Press Ctrl+C to stop.`);

      const seenUrls = new Set<string>();
      let isFirst = true;
      let polling = false;
      let consecutiveErrors = 0;
      const abortController = new AbortController();

      const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
      // Untrack from lifecycle so we manage our own close without double-close race
      untrackBrowser(browser);
      try {
        await assertAuthenticated(page);
        const profileUrl = opts.profile === "me" ? await resolveMyProfileUrl(page) : opts.profile;

        const poll = async () => {
          if (polling || abortController.signal.aborted) {
            return;
          }
          polling = true;

          try {
            const results = await listPosts(page, profileUrl, limit, opts.engagement);
            consecutiveErrors = 0;

            const newPosts = results.filter((p) => {
              const key = p.postUrl || p.text.slice(0, 120);
              if (seenUrls.has(key)) {
                return false;
              }
              seenUrls.add(key);
              return true;
            });

            if (isFirst) {
              await outputResult(results, format, { template: opts.template, outputPath: opts.output });
              isFirst = false;
            } else if (newPosts.length > 0) {
              console.error(`\n--- ${newPosts.length} new post(s) detected ---`);
              await outputResult(newPosts, format, { template: opts.template });
            }
          } finally {
            polling = false;
          }
        };

        await poll();

        const timer = setInterval(() => {
          poll().catch((err) => {
            consecutiveErrors += 1;
            console.error(`Watch poll error: ${err instanceof Error ? err.message : String(err)}`);
            polling = false;
            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error(`${maxConsecutiveErrors} consecutive errors, stopping watch.`);
              clearInterval(timer);
              abortController.abort();
            }
          });
        }, intervalMs);

        // Wait until abort (from SIGINT via lifecycle handler or consecutive errors)
        await new Promise<void>((resolve) => {
          if (abortController.signal.aborted) {
            resolve();
            return;
          }
          const onAbort = () => {
            clearInterval(timer);
            resolve();
          };
          abortController.signal.addEventListener("abort", onAbort, { once: true });
          process.prependOnceListener("SIGINT", () => {
            abortController.abort();
          });
        });
      } finally {
        await browser.close();
      }

      return;
    }

    const progress = new Progress();
    progress.start("Collecting posts...");

    const { browser, page } = await launchAuthenticatedContext(opts.browser, !opts.headed);
    try {
      await assertAuthenticated(page);
      const profileUrl = opts.profile === "me" ? await resolveMyProfileUrl(page) : opts.profile;
      const results = await listPosts(page, profileUrl, limit, opts.engagement);
      progress.stop(`Collected ${results.length} posts.`);
      await outputResult(results, format, { template: opts.template, outputPath: opts.output });
    } catch (err) {
      progress.stop("Failed.");
      throw err;
    } finally {
      await browser.close();
    }
  });
}
