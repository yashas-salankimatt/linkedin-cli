import { Command } from "commander";
import { launchBrowser, type SupportedBrowser, assertAuthenticated } from "../core/browser.js";
import { clearStorageState, getLiAtCookieMeta, importCookiesFromFile, saveStorageState, sessionExists } from "../core/session.js";
import { clearAllCache } from "../utils/cache.js";
import { getConfigPath, loadConfig, saveConfig, type Config } from "../utils/config.js";
import { parseBrowser } from "../utils/options.js";
import { waitForEnter } from "../utils/prompt.js";

interface AuthCommonOpts {
  browser: SupportedBrowser;
}

function addBrowserOption(command: Command): Command {
  return command.option("--browser <browser>", "Browser: chromium|firefox|webkit", parseBrowser, "chromium");
}

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage LinkedIn session authentication");

  addBrowserOption(auth.command("login").description("Login with an interactive browser session")).action(
    async (opts: AuthCommonOpts) => {
      const browser = await launchBrowser(opts.browser, false);
      try {
        const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
        const page = await context.newPage();
        await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" });
        await waitForEnter("Complete LinkedIn login in the opened browser, then press Enter in this terminal.");
        await assertAuthenticated(page);
        const state = await context.storageState();
        await saveStorageState(state);
        console.log("LinkedIn session saved.");
      } finally {
        await browser.close();
      }
    }
  );

  auth
    .command("import-cookies")
    .description("Import LinkedIn cookies from an exported JSON file")
    .requiredOption("--file <path>", "Path to cookies JSON")
    .action(async (opts: { file: string }) => {
      const count = await importCookiesFromFile(opts.file);
      console.log(`Imported ${count} cookies into local LinkedIn session.`);
    });

  auth
    .command("status")
    .description("Show local LinkedIn auth session status")
    .action(async () => {
      const hasSession = await sessionExists();
      if (!hasSession) {
        console.log("No local session found.");
        return;
      }

      const liAt = await getLiAtCookieMeta();
      if (!liAt) {
        console.log("Session exists, but required li_at cookie is missing.");
        return;
      }

      const expiryText = liAt.expires < 0 ? "session cookie" : new Date(liAt.expires * 1000).toISOString();

      const now = Date.now();
      let status = "valid";
      if (liAt.expires > 0 && liAt.expires * 1000 < now) {
        status = "expired";
      } else if (liAt.expires > 0 && liAt.expires * 1000 - now < 24 * 60 * 60 * 1000) {
        status = "expiring soon";
      }

      console.log(`Authenticated: yes\nStatus: ${status}\nCookie domain: ${liAt.domain}\nExpires: ${expiryText}`);
    });

  auth
    .command("logout")
    .description("Delete saved local LinkedIn session")
    .action(async () => {
      await clearStorageState();
      console.log("LinkedIn session removed.");
    });

  // Config sub-commands
  const config = program.command("config").description("Manage CLI configuration");

  config
    .command("show")
    .description("Show current configuration")
    .action(async () => {
      const cfg = await loadConfig();
      console.log(`Config path: ${getConfigPath()}\n`);
      console.log(JSON.stringify(cfg, null, 2));
    });

  config
    .command("set")
    .description("Set a configuration value (e.g. config set browser firefox)")
    .argument("<key>", "Config key (e.g. browser, verbose, delay.minMs)")
    .argument("<value>", "Config value")
    .action(async (key: string, value: string) => {
      const validTopKeys = new Set(["browser", "headed", "defaultLimit", "delay", "cache", "output", "verbose"]);
      const validNestedKeys: Record<string, Set<string>> = {
        delay: new Set(["minMs", "maxMs"]),
        cache: new Set(["enabled", "ttlMinutes"])
      };

      const cfg = await loadConfig();
      const updates: Record<string, unknown> = {};

      if (key.includes(".")) {
        const parts = key.split(".");
        if (parts.length !== 2) {
          console.error(`Invalid nested key: ${key}. Use format parent.child (e.g. delay.minMs).`);
          process.exitCode = 1;
          return;
        }
        const [parent, child] = parts;
        if (!validTopKeys.has(parent) || !validNestedKeys[parent]?.has(child)) {
          console.error(`Unknown config key: ${key}. Valid nested keys: ${Object.entries(validNestedKeys).flatMap(([p, children]) => [...children].map((c) => `${p}.${c}`)).join(", ")}`);
          process.exitCode = 1;
          return;
        }
        const parentObj = { ...((cfg as Record<string, unknown>)[parent] as Record<string, unknown>) };
        const numVal = Number(value);
        parentObj[child] = Number.isNaN(numVal) ? value : numVal;
        updates[parent] = parentObj;
      } else {
        if (!validTopKeys.has(key)) {
          console.error(`Unknown config key: ${key}. Valid keys: ${[...validTopKeys].join(", ")}`);
          process.exitCode = 1;
          return;
        }
        if (value === "true") {
          updates[key] = true;
        } else if (value === "false") {
          updates[key] = false;
        } else {
          const numVal = Number(value);
          updates[key] = Number.isNaN(numVal) ? value : numVal;
        }
      }

      await saveConfig(updates as Partial<Config>);
      console.log(`Set ${key} = ${value}`);
    });

  config
    .command("clear-cache")
    .description("Clear all cached data")
    .action(async () => {
      await clearAllCache();
      console.log("Cache cleared.");
    });
}
