import "dotenv/config";
import { validateRuntimeEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";

function redact(value: string) {
  const [local, domain = ""] = value.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

validateRuntimeEnvironment();

const counts = await prisma.emailOutbox.groupBy({ by: ["status"], _count: { _all: true } });
const failures = await prisma.emailOutbox.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, kind: true, recipient: true, status: true, attemptCount: true, lastErrorCode: true, updatedAt: true } });
console.log(JSON.stringify({ counts, failures: failures.map((item) => ({ ...item, recipient: redact(item.recipient) })) }, null, 2));
await prisma.$disconnect();
