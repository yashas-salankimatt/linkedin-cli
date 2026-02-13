import process from "node:process";

export const logger = {
  verbose: false,

  debug(msg: string): void {
    if (this.verbose) {
      process.stderr.write(`[debug] ${msg}\n`);
    }
  },

  info(msg: string): void {
    process.stderr.write(`${msg}\n`);
  },

  warn(msg: string): void {
    process.stderr.write(`[warn] ${msg}\n`);
  },

  error(msg: string): void {
    process.stderr.write(`[error] ${msg}\n`);
  }
};
