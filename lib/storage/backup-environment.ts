import { LocalPrivateStorage } from "./local";
import { R2PrivateStorage } from "./r2";

export function backupStorageFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  if ((environment.MEDIA_BACKUP_DRIVER ?? "local") === "local") return new LocalPrivateStorage(environment.MEDIA_BACKUP_ROOT ?? ".data/private-media-backup");
  return R2PrivateStorage.fromEnvironment({
    ...environment,
    R2_ENDPOINT: environment.MEDIA_BACKUP_R2_ENDPOINT,
    R2_BUCKET: environment.MEDIA_BACKUP_R2_BUCKET,
    R2_ACCESS_KEY_ID: environment.MEDIA_BACKUP_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: environment.MEDIA_BACKUP_R2_SECRET_ACCESS_KEY,
    R2_REGION: environment.MEDIA_BACKUP_R2_REGION ?? "auto",
    R2_FORCE_PATH_STYLE: environment.MEDIA_BACKUP_R2_FORCE_PATH_STYLE ?? "false",
  });
}
