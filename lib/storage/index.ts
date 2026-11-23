import { LocalPrivateStorage } from "./local";
import { R2PrivateStorage } from "./r2";
import type { PrivateObjectStorage } from "./types";

export function storageFromEnvironment(environment: NodeJS.ProcessEnv = process.env): PrivateObjectStorage {
  return environment.STORAGE_DRIVER === "r2" ? R2PrivateStorage.fromEnvironment(environment) : new LocalPrivateStorage(environment.PRIVATE_MEDIA_ROOT);
}

export const privateStorage = storageFromEnvironment();

export { LocalPrivateStorage } from "./local";
export { R2PrivateStorage } from "./r2";
export type { PrivateObjectStorage } from "./types";
