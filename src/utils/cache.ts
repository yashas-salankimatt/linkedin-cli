import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

const CACHE_DIR = path.join(os.homedir(), ".linkedin-cli", "cache");

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
}

function cacheFilePath(namespace: string, identifier: string): string {
  const hash = crypto.createHash("sha256").update(`${namespace}:${identifier}`).digest("hex").slice(0, 32);
  return path.join(CACHE_DIR, `${namespace}-${hash}.json`);
}

export async function getCached<T>(namespace: string, identifier: string): Promise<T | null> {
  const filePath = cacheFilePath(namespace, identifier);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      logger.debug(`Cache expired for ${namespace}:${identifier}`);
      await fs.rm(filePath, { force: true });
      return null;
    }
    logger.debug(`Cache hit for ${namespace}:${identifier}`);
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(namespace: string, identifier: string, data: T, ttlMs: number): Promise<void> {
  await ensureCacheDir();
  const filePath = cacheFilePath(namespace, identifier);
  const entry: CacheEntry<T> = { data, cachedAt: Date.now(), ttlMs };
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2), { mode: 0o600 });
  logger.debug(`Cached ${namespace}:${identifier} (ttl=${ttlMs}ms)`);
}

export async function clearAllCache(): Promise<void> {
  try {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    logger.debug("Cache cleared.");
  } catch {
    // ignore
  }
}
