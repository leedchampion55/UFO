import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start"], {
  stdio: "inherit",
  env: process.env,
});
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "info", event: "web.shutdown", signal })}\n`);
  child.kill(signal);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 25_000);
  timeout.unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));
child.on("exit", (code, signal) => process.exit(signal ? 0 : (code ?? 1)));
