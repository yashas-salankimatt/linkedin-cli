import fs from "node:fs/promises";
import path from "node:path";
import { formatOutput, type OutputFormat } from "./format.js";

export async function outputResult(
  payload: unknown,
  format: OutputFormat,
  options?: { template?: string; outputPath?: string }
): Promise<void> {
  const output = formatOutput(payload, format, options?.template);

  if (options?.outputPath) {
    const dir = path.dirname(options.outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(options.outputPath, output + "\n", { encoding: "utf8", mode: 0o600 });
    process.stderr.write(`Output written to ${options.outputPath}\n`);
  } else {
    console.log(output);
  }
}
