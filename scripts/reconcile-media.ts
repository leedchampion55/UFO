import "dotenv/config";
import { validateServiceEnvironment } from "@/lib/env";
import { reconcileMediaStorage } from "@/lib/media-lifecycle";
import { prisma } from "@/lib/prisma";
import { withOperationLease } from "@/lib/operations/lease";
import { operationalLog } from "@/lib/operations/logger";

validateServiceEnvironment("media-maintenance");
const apply = process.argv.includes("--apply");
const leased = await withOperationLease("media-reconciliation", () => reconcileMediaStorage({ dryRun: !apply }), { ttlSeconds: 900 });
if (!leased.acquired) operationalLog("info", "media.reconcile_skipped", { reason: "LEASE_HELD" });
else operationalLog("info", "media.reconcile_completed", { dryRun: leased.value.dryRun, actionCount: leased.value.actions.length });
await prisma.$disconnect();
