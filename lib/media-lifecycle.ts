import type { PrivateObjectStorage } from "@/lib/storage";
import { privateStorage } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

function storageErrorCode(error: unknown) {
  if (typeof error === "object" && error && "name" in error) return `STORAGE_${String(error.name).toUpperCase().replaceAll(/[^A-Z0-9_]/g, "_")}`.slice(0, 120);
  return "STORAGE_OPERATION_FAILED";
}

export async function uploadMediaObject(mediaId: string, data: Buffer, mimeType: string, storage: PrivateObjectStorage = privateStorage) {
  const media = await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "PENDING_UPLOAD", storageAttempts: { increment: 1 }, storageUpdatedAt: new Date(), lastStorageError: null }, select: { storageKey: true } });
  try {
    const stored = await storage.put(media.storageKey, data, { contentType: mimeType });
    await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "READY", storageUpdatedAt: new Date(), storageEtag: stored.etag ?? null, lastStorageError: null } });
    return stored;
  } catch (error) {
    await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "FAILED", storageUpdatedAt: new Date(), lastStorageError: storageErrorCode(error) } }).catch(() => undefined);
    throw error;
  }
}

export async function deleteMediaObject(mediaId: string, storage: PrivateObjectStorage = privateStorage) {
  const media = await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "DELETING", storageAttempts: { increment: 1 }, storageUpdatedAt: new Date(), lastStorageError: null }, select: { storageKey: true } });
  try {
    await storage.delete(media.storageKey);
    await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "REMOVED", storageUpdatedAt: new Date(), storageEtag: null, lastStorageError: null, removedAt: new Date(), approvedAt: null, approvedByAdminId: null } });
  } catch (error) {
    await prisma.encounterMedia.update({ where: { id: mediaId }, data: { storageStatus: "DELETING", storageUpdatedAt: new Date(), lastStorageError: storageErrorCode(error) } }).catch(() => undefined);
    throw error;
  }
}

export async function reconcileMediaStorage(options: { dryRun?: boolean; storage?: PrivateObjectStorage; staleMinutes?: number } = {}) {
  const dryRun = options.dryRun ?? true;
  const storage = options.storage ?? privateStorage;
  const staleBefore = new Date(Date.now() - (options.staleMinutes ?? 30) * 60 * 1000);
  const records = await prisma.encounterMedia.findMany({ select: { id: true, storageKey: true, storageStatus: true, storageUpdatedAt: true } });
  const actions: Array<{ mediaId?: string; key: string; action: string }> = [];
  for (const media of records) {
    if (media.storageStatus === "REMOVED") continue;
    if (media.storageStatus === "DELETING") {
      actions.push({ mediaId: media.id, key: media.storageKey, action: "RETRY_DELETE" });
      if (!dryRun) await deleteMediaObject(media.id, storage).catch(() => undefined);
      continue;
    }
    const exists = await storage.exists(media.storageKey);
    if (media.storageStatus === "READY" && !exists) {
      actions.push({ mediaId: media.id, key: media.storageKey, action: "MARK_FAILED_MISSING" });
      if (!dryRun) await prisma.encounterMedia.update({ where: { id: media.id }, data: { storageStatus: "FAILED", storageUpdatedAt: new Date(), lastStorageError: "STORAGE_OBJECT_MISSING", approvedAt: null, approvedByAdminId: null } });
    } else if (["PENDING_UPLOAD", "FAILED"].includes(media.storageStatus) && exists) {
      actions.push({ mediaId: media.id, key: media.storageKey, action: "MARK_READY_FOUND" });
      if (!dryRun) await prisma.encounterMedia.update({ where: { id: media.id }, data: { storageStatus: "READY", storageUpdatedAt: new Date(), lastStorageError: null } });
    } else if (media.storageStatus === "PENDING_UPLOAD" && !exists && media.storageUpdatedAt < staleBefore) {
      actions.push({ mediaId: media.id, key: media.storageKey, action: "MARK_FAILED_ABANDONED" });
      if (!dryRun) await prisma.encounterMedia.update({ where: { id: media.id }, data: { storageStatus: "FAILED", storageUpdatedAt: new Date(), lastStorageError: "STORAGE_UPLOAD_ABANDONED" } });
    }
  }
  const knownKeys = new Set(records.map((record) => record.storageKey));
  for (const object of await storage.list("encounters")) {
    if (!knownKeys.has(object.key)) {
      actions.push({ key: object.key, action: "DELETE_ORPHAN_OBJECT" });
      if (!dryRun) await storage.delete(object.key);
    }
  }
  return { dryRun, actions };
}
