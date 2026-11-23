import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertStorageKey } from "./key";
import type { PrivateObjectStorage, StoredObject, StoredObjectInfo } from "./types";

export class LocalPrivateStorage implements PrivateObjectStorage {
  private root: string;

  constructor(root = process.env.PRIVATE_MEDIA_ROOT ?? ".data/private-media") {
    this.root = path.resolve(/* turbopackIgnore: true */ process.cwd(), root);
  }

  private resolve(key: string) {
    assertStorageKey(key);
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

  async exists(key: string) {
    try { await access(this.resolve(key)); return true; }
    catch { return false; }
  }

  async list(prefix: string) {
    assertStorageKey(prefix);
    const start = this.resolve(prefix);
    const results: StoredObjectInfo[] = [];
    const walk = async (directory: string) => {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.isFile()) {
          const details = await stat(full);
          results.push({ key: path.relative(this.root, full).split(path.sep).join("/"), byteSize: details.size, lastModified: details.mtime });
        }
      }
    };
    await walk(start);
    return results;
  }
}
