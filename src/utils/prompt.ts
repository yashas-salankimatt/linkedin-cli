import process from "node:process";

export async function waitForEnter(message: string): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("Interactive login requires a TTY terminal. Use `linkedin auth import-cookies` instead.");
  }

  process.stdout.write(`${message}\n`);

  await new Promise<void>((resolve, reject) => {
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    const onData = () => {
      cleanup();
      resolve();
    };

    const onEnd = () => {
      cleanup();
      reject(new Error("stdin closed before input was received."));
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdin.removeListener("end", onEnd);
      process.stdin.removeListener("error", onError);
    };

    process.stdin.on("data", onData);
    process.stdin.on("end", onEnd);
    process.stdin.on("error", onError);
  });
}
