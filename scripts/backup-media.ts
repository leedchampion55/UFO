import "dotenv/config";
import { backupPrivateMedia } from "@/lib/storage/backup";
import { backupStorageFromEnvironment } from "@/lib/storage/backup-environment";
import { privateStorage } from "@/lib/storage";
import { operationalLog } from "@/lib/operations/logger";
import { withOperationLease } from "@/lib/operations/lease";
import { prisma } from "@/lib/prisma";

const apply = process.argv.includes("--apply");
const leased = await withOperationLease("private-media-backup", () => backupPrivateMedia(privateStorage, backupStorageFromEnvironment(), { dryRun: !apply }), { ttlSeconds: 3_600 });
if (!leased.acquired) operationalLog("info", "media.backup_skipped", { reason: "LEASE_HELD" });
else operationalLog("info", "media.backup_completed", { dryRun: leased.value.dryRun, checked: leased.value.checked, copied: leased.value.copied });
await prisma.$disconnect();
