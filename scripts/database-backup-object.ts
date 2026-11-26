import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanupEncryptedDatabaseBackups, databaseBackupStorageFromEnvironment, retrieveEncryptedDatabaseBackup, storeEncryptedDatabaseBackup } from "@/lib/database-backup";
import { operationalLog } from "@/lib/operations/logger";

function option(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const action = process.argv[2];
const storage = databaseBackupStorageFromEnvironment();

try {
  if (action === "upload") {
    const file = option("file");
    const key = option("key");
    if (!file || !key) throw new Error("DATABASE_BACKUP_UPLOAD_ARGUMENTS_REQUIRED");
    const result = await storeEncryptedDatabaseBackup(storage, key, await readFile(file));
    operationalLog("info", "database.backup_object_uploaded", { key: result.key, byteSize: result.byteSize, integrity: "verified" });
  } else if (action === "download") {
    const key = option("key");
    const destination = option("destination");
    const apply = process.argv.includes("--apply");
    if (!key || !destination) throw new Error("DATABASE_BACKUP_DOWNLOAD_ARGUMENTS_REQUIRED");
    const result = await retrieveEncryptedDatabaseBackup(storage, key);
    if (apply) {
      await mkdir(path.dirname(path.resolve(destination)), { recursive: true, mode: 0o700 });
      await writeFile(destination, result.archive, { mode: 0o600 });
      await writeFile(`${destination}.sha256`, Buffer.from(`${result.digest}  ${path.basename(destination)}\n`), { mode: 0o600 });
    }
    operationalLog("info", "database.backup_object_downloaded", { key, byteSize: result.archive.byteLength, integrity: "verified", dryRun: !apply });
  } else if (action === "cleanup") {
    const days = Number(option("days") ?? process.env.BACKUP_RETENTION_DAYS ?? "30");
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error("DATABASE_BACKUP_RETENTION_INVALID");
    const result = await cleanupEncryptedDatabaseBackups(storage, { before: new Date(Date.now() - days * 86_400_000), dryRun: !process.argv.includes("--apply") });
    operationalLog("info", "database.backup_retention_completed", { dryRun: result.dryRun, count: result.count });
  } else {
    throw new Error("DATABASE_BACKUP_ACTION_REQUIRED");
  }
} catch (error) {
  operationalLog("error", "database.backup_object_failed", { errorId: error instanceof Error ? error.message : "DATABASE_BACKUP_OBJECT_FAILURE" });
  process.exitCode = 1;
}
