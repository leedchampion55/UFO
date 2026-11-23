import "dotenv/config";
import { cleanupEmailOutbox } from "@/lib/email/outbox";
import { validateRuntimeEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";

validateRuntimeEnvironment();
const apply = process.argv.includes("--apply");
const result = await cleanupEmailOutbox({ dryRun: !apply });
console.log(JSON.stringify(result));
await prisma.$disconnect();
