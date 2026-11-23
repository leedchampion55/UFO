import "dotenv/config";
import { processEmailOutbox } from "@/lib/email/outbox";
import { validateRuntimeEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const watch = process.argv.includes("--watch");
validateRuntimeEnvironment();

async function run() {
  const result = await processEmailOutbox({ limit: 50 });
  console.log(JSON.stringify(result));
}

try {
  if (watch) {
    await run();
    setInterval(() => void run().catch((error) => console.error(error instanceof Error ? error.name : "OUTBOX_WORKER_FAILURE")), 10_000);
  } else {
    await run();
    await prisma.$disconnect();
  }
} catch (error) {
  console.error(error instanceof Error ? error.name : "OUTBOX_WORKER_FAILURE");
  await prisma.$disconnect();
  process.exitCode = 1;
}
