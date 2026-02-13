import process from "node:process";

const SPINNER_FRAMES = ["\u28CB", "\u28D9", "\u28F9", "\u28F8", "\u28FC", "\u28F4", "\u28E6", "\u28E7", "\u28C7", "\u28CF"];

export class Progress {
  private interval?: ReturnType<typeof setInterval>;
  private frame = 0;
  private message = "";
  private isTTY = process.stderr.isTTY ?? false;

  start(message: string): void {
    this.message = message;
    this.frame = 0;

    if (!this.isTTY) {
      process.stderr.write(`${message}\n`);
      return;
    }

    this.render();
    this.interval = setInterval(() => {
      this.render();
    }, 80);
  }

  update(message: string): void {
    this.message = message;
    if (!this.isTTY && this.interval === undefined) {
      process.stderr.write(`${message}\n`);
    }
  }

  stop(finalMessage?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }

    if (this.isTTY) {
      const msg = finalMessage ?? this.message;
      process.stderr.write(`\r\x1b[K${msg}\n`);
    } else if (finalMessage) {
      process.stderr.write(`${finalMessage}\n`);
    }
  }

  private render(): void {
    const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
    process.stderr.write(`\r\x1b[K${spinner} ${this.message}`);
    this.frame += 1;
  }
}
