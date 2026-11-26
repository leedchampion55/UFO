import "dotenv/config";
import { validateServiceEnvironment } from "../lib/env";
import { cleanupExpiredRateLimits } from "../lib/security";
import { prisma } from "../lib/prisma";
import { withOperationLease } from "../lib/operations/lease";
import { operationalLog } from "../lib/operations/logger";

validateServiceEnvironment("rate-limit-maintenance");
try {
  const leased = await withOperationLease("rate-limit-cleanup", () => cleanupExpiredRateLimits(), { ttlSeconds: 300 });
  operationalLog("info", leased.acquired ? "rate_limit.cleanup_completed" : "rate_limit.cleanup_skipped", leased.acquired ? { removed: leased.value.count } : { reason: "LEASE_HELD" });
} finally {
  await prisma.$disconnect();
}
