import "dotenv/config";
import { processEmailOutbox } from "@/lib/email/outbox";
import { validateRuntimeEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { withOperationLease } from "@/lib/operations/lease";
import { operationalLog } from "@/lib/operations/logger";

const watch = process.argv.includes("--watch");
validateRuntimeEnvironment();

let stopping = false;
let active: Promise<void> | null = null;

async function run() {
  const leased = await withOperationLease("email-outbox-worker", () => processEmailOutbox({ limit: 50 }), { ttlSeconds: 300 });
  if (!leased.acquired) return operationalLog("info", "email.worker_skipped", { reason: "LEASE_HELD" });
  operationalLog("info", "email.worker_completed", leased.value);
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => { const timer = setTimeout(resolve, milliseconds); if (stopping) { clearTimeout(timer); resolve(); } });
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  operationalLog("info", "email.worker_shutdown", { signal });
  await active?.catch(() => undefined);
  await prisma.$disconnect();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  if (watch) {
    while (!stopping) {
      active = run();
      await active;
      active = null;
      if (!stopping) await delay(10_000);
    }
  } else {
    await run();
    await prisma.$disconnect();
  }
} catch (error) {
  operationalLog("error", "email.worker_failed", { errorId: error instanceof Error ? error.name : "OUTBOX_WORKER_FAILURE" });
  await prisma.$disconnect();
  process.exitCode = 1;
}
