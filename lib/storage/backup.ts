import { createHash } from "node:crypto";
import type { PrivateObjectStorage } from "./types";

export type MediaBackupEntry = { key: string; byteSize: number; sha256: string; copied: boolean };

export async function backupPrivateMedia(source: PrivateObjectStorage, backup: PrivateObjectStorage, options: { prefix?: string; dryRun?: boolean } = {}) {
  const prefix = options.prefix ?? "encounters";
  const dryRun = options.dryRun ?? true;
  const entries: MediaBackupEntry[] = [];
  for (const object of await source.list(prefix)) {
    const data = await source.get(object.key);
    const sha256 = createHash("sha256").update(data).digest("hex");
    let copied = false;
    if (!dryRun) {
      const targetMatches = await backup.exists(object.key) && createHash("sha256").update(await backup.get(object.key)).digest("hex") === sha256;
      if (!targetMatches) {
        await backup.put(object.key, data, { contentType: "image/webp" });
        const targetHash = createHash("sha256").update(await backup.get(object.key)).digest("hex");
        if (targetHash !== sha256) throw new Error("MEDIA_BACKUP_INTEGRITY_FAILURE");
        copied = true;
      }
    }
    entries.push({ key: object.key, byteSize: data.byteLength, sha256, copied });
  }
  return { dryRun, checked: entries.length, copied: entries.filter((entry) => entry.copied).length, entries };
}

export async function restorePrivateMediaObject(key: string, source: PrivateObjectStorage, backup: PrivateObjectStorage, options: { dryRun?: boolean; overwrite?: boolean } = {}) {
  const dryRun = options.dryRun ?? true;
  const exists = await source.exists(key);
  if (exists && !options.overwrite) return { key, restored: false, reason: "SOURCE_EXISTS" as const, dryRun };
  const data = await backup.get(key);
  const sha256 = createHash("sha256").update(data).digest("hex");
  if (!dryRun) {
    await source.put(key, data, { contentType: "image/webp" });
    const restoredHash = createHash("sha256").update(await source.get(key)).digest("hex");
    if (restoredHash !== sha256) throw new Error("MEDIA_RESTORE_INTEGRITY_FAILURE");
  }
  return { key, restored: !dryRun, reason: dryRun ? "DRY_RUN" as const : "RESTORED" as const, dryRun, sha256 };
}
