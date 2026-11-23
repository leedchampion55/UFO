import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function integerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(parsed, maximum)) : fallback;
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
  max: integerSetting("DATABASE_POOL_MAX", process.env.NODE_ENV === "production" ? 5 : 10, 1, 20),
  connectionTimeoutMillis: integerSetting("DATABASE_CONNECT_TIMEOUT_MS", 5_000, 500, 30_000),
  idleTimeoutMillis: integerSetting("DATABASE_IDLE_TIMEOUT_MS", 30_000, 1_000, 300_000),
  application_name: process.env.DATABASE_APPLICATION_NAME ?? "what-the-ufo-web",
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
