import "dotenv/config";
import { cleanupExpiredRateLimits } from "../lib/security";
import { prisma } from "../lib/prisma";

try {
  const result = await cleanupExpiredRateLimits();
  console.log(`Removed ${result.count} expired rate-limit rows.`);
} finally {
  await prisma.$disconnect();
}
