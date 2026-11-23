export type StoredObject = { key: string; byteSize: number; etag?: string };
export type StoredObjectInfo = StoredObject & { lastModified?: Date };
export type PutObjectOptions = { contentType?: string };

export interface PrivateObjectStorage {
  put(key: string, data: Buffer, options?: PutObjectOptions): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix: string): Promise<StoredObjectInfo[]>;
}
