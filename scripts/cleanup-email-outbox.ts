import "dotenv/config";
import { cleanupEmailOutbox } from "@/lib/email/outbox";
import { validateRuntimeEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { withOperationLease } from "@/lib/operations/lease";
import { operationalLog } from "@/lib/operations/logger";

validateRuntimeEnvironment();
const apply = process.argv.includes("--apply");
const leased = await withOperationLease("email-outbox-cleanup", () => cleanupEmailOutbox({ dryRun: !apply }), { ttlSeconds: 300 });
operationalLog("info", leased.acquired ? "email.cleanup_completed" : "email.cleanup_skipped", leased.acquired ? leased.value : { reason: "LEASE_HELD" });
await prisma.$disconnect();
