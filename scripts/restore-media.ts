import "dotenv/config";
import { restorePrivateMediaObject } from "@/lib/storage/backup";
import { backupStorageFromEnvironment } from "@/lib/storage/backup-environment";
import { privateStorage } from "@/lib/storage";
import { operationalLog } from "@/lib/operations/logger";

const key = process.argv.find((value) => value.startsWith("--key="))?.slice(6);
if (!key) throw new Error("Pass the exact object key with --key=encounters/...");
const result = await restorePrivateMediaObject(key, privateStorage, backupStorageFromEnvironment(), { dryRun: !process.argv.includes("--apply"), overwrite: process.argv.includes("--overwrite") });
operationalLog("info", "media.restore_completed", { dryRun: result.dryRun, restored: result.restored, reason: result.reason });
