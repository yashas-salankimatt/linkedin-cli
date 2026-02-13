import { logger } from "./logger.js";

let delayRange = { minMs: 800, maxMs: 2500 };

export function setDelayRange(minMs: number, maxMs: number): void {
  if (minMs < 0 || maxMs < 0) {
    logger.warn("Delay values must be non-negative, using defaults.");
    return;
  }
  if (minMs > maxMs) {
    delayRange = { minMs: maxMs, maxMs: minMs };
  } else {
    delayRange = { minMs, maxMs };
  }
}

export function getDelayRange(): { minMs: number; maxMs: number } {
  return { ...delayRange };
}

export async function randomDelay(minMs?: number, maxMs?: number): Promise<void> {
  const min = minMs ?? delayRange.minMs;
  const max = maxMs ?? delayRange.maxMs;
  const ms = Math.floor(min + Math.random() * (max - min));
  logger.debug(`Waiting ${ms}ms`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomScrollPixels(viewportHeight: number = 900): number {
  return Math.floor(viewportHeight * (1.2 + Math.random() * 1.0));
}
