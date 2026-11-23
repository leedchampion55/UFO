-- Existing Phase 2/3/4B media has already been written to the configured
-- private store. Preserve it by marking accessible records ready and records
-- already removed as removed. New uploads retain the PENDING_UPLOAD default.
UPDATE "EncounterMedia"
SET
  "storageStatus" = CASE
    WHEN "removedAt" IS NULL THEN 'READY'::"MediaStorageStatus"
    ELSE 'REMOVED'::"MediaStorageStatus"
  END,
  "storageUpdatedAt" = CURRENT_TIMESTAMP;
