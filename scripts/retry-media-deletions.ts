import "dotenv/config";
import { validateServiceEnvironment } from "@/lib/env";
import { retryFailedMediaDeletions } from "@/lib/media-lifecycle";
import { withOperationLease } from "@/lib/operations/lease";
import { operationalLog } from "@/lib/operations/logger";
import { prisma } from "@/lib/prisma";

validateServiceEnvironment("media-maintenance");
const apply = process.argv.includes("--apply");
const leased = await withOperationLease("media-deletion-retry", () => retryFailedMediaDeletions({ dryRun: !apply }), { ttlSeconds: 900 });
operationalLog("info", leased.acquired ? "media.deletion_retry_completed" : "media.deletion_retry_skipped", leased.acquired ? leased.value : { reason: "LEASE_HELD" });
await prisma.$disconnect();
