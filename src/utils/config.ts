import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const CONFIG_DIR = path.join(os.homedir(), ".linkedin-cli");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const configSchema = z
  .object({
    browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
    headed: z.boolean().default(false),
    defaultLimit: z.number().int().positive().default(10),
    delay: z
      .object({
        minMs: z.number().int().min(0).default(800),
        maxMs: z.number().int().min(0).default(2500)
      })
      .default({}),
    cache: z
      .object({
        enabled: z.boolean().default(true),
        ttlMinutes: z.number().int().positive().default(1440)
      })
      .default({}),
    output: z.enum(["text", "json", "csv", "tsv"]).default("text"),
    verbose: z.boolean().default(false)
  })
  .default({});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export async function loadConfig(): Promise<Config> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    cachedConfig = configSchema.parse(JSON.parse(raw));
  } catch {
    cachedConfig = configSchema.parse({});
  }
  return cachedConfig;
}

export async function saveConfig(config: Partial<Config>): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const current = await loadConfig();
  const merged: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof merged[key] === "object" && merged[key] !== null) {
      merged[key] = { ...(merged[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
    } else {
      merged[key] = value;
    }
  }

  await fs.writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });
  cachedConfig = configSchema.parse(merged);
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
