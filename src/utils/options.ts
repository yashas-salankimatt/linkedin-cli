import { Command, InvalidArgumentError } from "commander";
import type { SupportedBrowser } from "../core/browser.js";
import type { OutputFormat } from "./format.js";

export function parseBrowser(value: string): SupportedBrowser {
  if (value === "chromium" || value === "firefox" || value === "webkit") {
    return value;
  }
  throw new InvalidArgumentError("Browser must be one of: chromium, firefox, webkit.");
}

export function collectNetwork(value: string, previous: Array<"1" | "2" | "3">): Array<"1" | "2" | "3"> {
  if (value !== "1" && value !== "2" && value !== "3") {
    throw new InvalidArgumentError("Network degree must be one of: 1, 2, 3.");
  }
  if (previous.includes(value)) {
    return previous;
  }
  return [...previous, value];
}

export function parseFormat(value: string): OutputFormat {
  if (value === "text" || value === "json" || value === "csv" || value === "tsv") {
    return value;
  }
  throw new InvalidArgumentError("Format must be one of: text, json, csv, tsv.");
}

export function parsePositiveInt(value: string, name: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new InvalidArgumentError(`${name} must be a positive integer.`);
  }
  return num;
}

export interface CommonOpts {
  browser: SupportedBrowser;
  headed: boolean;
  format: OutputFormat;
  json: boolean;
  template?: string;
  output?: string;
  cache: boolean; // commander --no-cache creates `cache: false`
}

// Alias for readability in command code
export function isCacheDisabled(opts: CommonOpts): boolean {
  return opts.cache === false;
}

export function addCommonOptions(command: Command): Command {
  return command
    .option("--browser <browser>", "Browser: chromium|firefox|webkit", parseBrowser, "chromium")
    .option("--headed", "Run browser in headed mode", false)
    .option("--format <fmt>", "Output format: text|json|csv|tsv", parseFormat, "text")
    .option("--json", "Shorthand for --format json", false)
    .option("--template <tpl>", "Output template e.g. '{{name}}\\t{{headline}}'")
    .option("--output <file>", "Write output to a file instead of stdout")
    .option("--no-cache", "Disable cache for this command");
}

export function resolveFormat(opts: CommonOpts): OutputFormat {
  if (opts.json) {
    return "json";
  }
  return opts.format;
}
