import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrivateObjectStorage, StoredObject } from "./types";

export class LocalPrivateStorage implements PrivateObjectStorage {
  private root: string;

  constructor(root = process.env.PRIVATE_MEDIA_ROOT ?? ".data/private-media") {
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), root);
  }

  private resolve(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("INVALID_STORAGE_KEY");
    return resolved;
  }

  async put(key: string, data: Buffer): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, data, { mode: 0o600 });
    return { key, byteSize: data.byteLength };
  }

  async get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}
