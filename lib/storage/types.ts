export type StoredObject = { key: string; byteSize: number };

export interface PrivateObjectStorage {
  put(key: string, data: Buffer): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
