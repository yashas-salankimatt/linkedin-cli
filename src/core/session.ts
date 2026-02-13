import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BrowserContext, Cookie } from "playwright";
import { z } from "zod";
import { logger } from "../utils/logger.js";

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

const APP_DIR = path.join(os.homedir(), ".linkedin-cli");
const STORAGE_STATE_PATH = path.join(APP_DIR, "storageState.json");

const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string().default("/"),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.string().optional(),
  expirationDate: z.number().optional()
});

const cookieExportSchema = z.union([z.object({ cookies: z.array(cookieSchema) }), z.array(cookieSchema)]);

const storageStateSchema = z.object({
  cookies: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      domain: z.string(),
      path: z.string(),
      expires: z.number(),
      httpOnly: z.boolean(),
      secure: z.boolean(),
      sameSite: z.enum(["Strict", "Lax", "None"])
    })
  ),
  origins: z.array(z.unknown())
});

function normalizeSameSite(value: string | undefined): "Lax" | "None" | "Strict" {
  const normalized = value?.toLowerCase();
  switch (normalized) {
    case "none":
    case "no_restriction":
      return "None";
    case "strict":
      return "Strict";
    case "lax":
    case "unspecified":
    default:
      return "Lax";
  }
}

function isLinkedInDomain(domain: string): boolean {
  const cleanDomain = domain.startsWith(".") ? domain.slice(1) : domain;
  return cleanDomain === "linkedin.com" || cleanDomain.endsWith(".linkedin.com");
}

export function getStorageStatePath(): string {
  return STORAGE_STATE_PATH;
}

async function ensureAppDir(): Promise<void> {
  await fs.mkdir(APP_DIR, { recursive: true, mode: 0o700 });
}

export async function sessionExists(): Promise<boolean> {
  try {
    await fs.access(STORAGE_STATE_PATH);
    return true;
  } catch {
    return false;
  }
}

export async function saveStorageState(state: StorageState): Promise<void> {
  await ensureAppDir();
  await fs.writeFile(STORAGE_STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export async function loadStorageState(): Promise<StorageState | null> {
  if (!(await sessionExists())) {
    return null;
  }

  const raw = await fs.readFile(STORAGE_STATE_PATH, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    logger.warn("Stored session file contains invalid JSON. Please re-authenticate.");
    return null;
  }
  const parsed = storageStateSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("Stored session file is corrupted or in unexpected format. Please re-authenticate.");
    return null;
  }
  return parsed.data as StorageState;
}

export async function clearStorageState(): Promise<void> {
  if (!(await sessionExists())) {
    return;
  }
  await fs.rm(STORAGE_STATE_PATH, { force: true });
}

export async function importCookiesFromFile(filePath: string): Promise<number> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    throw new Error(`Cannot read cookie file: ${filePath}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Cookie file contains invalid JSON: ${filePath}`);
  }

  const parseResult = cookieExportSchema.safeParse(json);
  if (!parseResult.success) {
    throw new Error("Cookie file format not recognized. Expected an array of cookies or { cookies: [...] }.");
  }

  const sourceCookies = Array.isArray(parseResult.data) ? parseResult.data : parseResult.data.cookies;

  const cookies: Cookie[] = sourceCookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure ?? true,
    httpOnly: cookie.httpOnly ?? true,
    sameSite: normalizeSameSite(cookie.sameSite),
    expires: cookie.expirationDate ?? -1
  }));

  const linkedInCookies = cookies.filter((cookie) => isLinkedInDomain(cookie.domain));
  const liAt = linkedInCookies.find((cookie) => cookie.name === "li_at");
  if (!liAt) {
    throw new Error("No LinkedIn li_at cookie found in exported cookie file.");
  }
  if (!liAt.value) {
    throw new Error("The li_at cookie has an empty value. Ensure you exported cookies while logged in.");
  }
  if (liAt.expires > 0 && liAt.expires < Date.now() / 1000) {
    throw new Error("The li_at cookie has already expired. Export fresh cookies while logged in.");
  }

  await saveStorageState({ cookies: linkedInCookies, origins: [] });
  return linkedInCookies.length;
}

export async function getLiAtCookieMeta(): Promise<{ expires: number; domain: string } | null> {
  const state = await loadStorageState();
  if (!state) {
    return null;
  }

  const liAt = state.cookies.find((cookie) => cookie.name === "li_at" && isLinkedInDomain(cookie.domain));
  if (!liAt) {
    return null;
  }

  return {
    expires: liAt.expires,
    domain: liAt.domain
  };
}

export async function checkSessionExpiry(): Promise<void> {
  const meta = await getLiAtCookieMeta();
  if (!meta) {
    throw new Error("Session file is missing the required li_at cookie. Run `linkedin auth login` to re-authenticate.");
  }

  if (meta.expires >= 0 && meta.expires * 1000 < Date.now()) {
    const expiredAt = new Date(meta.expires * 1000).toISOString();
    throw new Error(`Your LinkedIn session expired on ${expiredAt}. Run \`linkedin auth login\` to re-authenticate.`);
  }

  // Warn if expiring within 24 hours
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (meta.expires >= 0 && meta.expires * 1000 - Date.now() < oneDayMs) {
    const expiresAt = new Date(meta.expires * 1000).toISOString();
    logger.warn(`Session expires soon: ${expiresAt}. Consider re-authenticating.`);
  }
}
