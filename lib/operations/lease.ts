import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type OperationLease = { name: string; holder: string; expiresAt: Date };

export async function acquireOperationLease(name: string, ttlSeconds = 120, holder = `operation:${randomUUID()}`, now = new Date()): Promise<OperationLease | null> {
  const expiresAt = new Date(now.getTime() + Math.max(10, ttlSeconds) * 1_000);
  const rows = await prisma.$queryRaw<Array<{ name: string; holder: string; expiresAt: Date }>>(Prisma.sql`
    INSERT INTO "OperationalLease" ("name", "holder", "expiresAt", "createdAt", "updatedAt")
    VALUES (${name}, ${holder}, ${expiresAt}, ${now}, ${now})
    ON CONFLICT ("name") DO UPDATE
    SET "holder" = EXCLUDED."holder", "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = EXCLUDED."updatedAt"
    WHERE "OperationalLease"."expiresAt" < ${now} OR "OperationalLease"."holder" = ${holder}
    RETURNING "name", "holder", "expiresAt"
  `);
  return rows[0] ?? null;
}

export async function renewOperationLease(lease: OperationLease, ttlSeconds = 120) {
  const expiresAt = new Date(Date.now() + Math.max(10, ttlSeconds) * 1_000);
  const result = await prisma.operationalLease.updateMany({ where: { name: lease.name, holder: lease.holder }, data: { expiresAt } });
  if (!result.count) throw new Error("OPERATION_LEASE_LOST");
  lease.expiresAt = expiresAt;
}

export async function releaseOperationLease(lease: OperationLease) {
  await prisma.operationalLease.deleteMany({ where: { name: lease.name, holder: lease.holder } });
}

export async function withOperationLease<T>(name: string, callback: () => Promise<T>, options: { ttlSeconds?: number; holder?: string } = {}) {
  const lease = await acquireOperationLease(name, options.ttlSeconds, options.holder);
  if (!lease) return { acquired: false as const };
  try { return { acquired: true as const, value: await callback() }; }
  finally { await releaseOperationLease(lease).catch(() => undefined); }
}
