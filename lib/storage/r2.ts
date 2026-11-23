import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { assertStorageKey } from "./key";
import type { PrivateObjectStorage, PutObjectOptions, StoredObjectInfo } from "./types";

type S3Sender = Pick<S3Client, "send">;

async function responseBodyToBuffer(body: unknown) {
  if (!body) throw new Error("STORAGE_OBJECT_EMPTY");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "object" && body && "transformToByteArray" in body && typeof body.transformToByteArray === "function") return Buffer.from(await body.transformToByteArray());
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw new Error("STORAGE_OBJECT_UNREADABLE");
}

function isMissing(error: unknown) {
  return typeof error === "object" && error !== null && ("name" in error && ["NotFound", "NoSuchKey"].includes(String(error.name)) || "$metadata" in error && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);
}

export class R2PrivateStorage implements PrivateObjectStorage {
  constructor(private readonly client: S3Sender, private readonly bucket: string) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
    const endpoint = environment.R2_ENDPOINT;
    const bucket = environment.R2_BUCKET;
    const accessKeyId = environment.R2_ACCESS_KEY_ID;
    const secretAccessKey = environment.R2_SECRET_ACCESS_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error("R2_CONFIGURATION_MISSING");
    const client = new S3Client({
      region: environment.R2_REGION ?? "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: environment.R2_FORCE_PATH_STYLE === "true",
      maxAttempts: 3,
    });
    return new R2PrivateStorage(client, bucket);
  }

  async put(key: string, data: Buffer, options: PutObjectOptions = {}) {
    assertStorageKey(key);
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: options.contentType, CacheControl: "private, no-store" }));
    return { key, byteSize: data.byteLength, etag: result.ETag };
  }

  async get(key: string) {
    assertStorageKey(key);
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return responseBodyToBuffer(result.Body);
  }

  async delete(key: string) {
    assertStorageKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string) {
    assertStorageKey(key);
    try { await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })); return true; }
    catch (error) { if (isMissing(error)) return false; throw error; }
  }

  async list(prefix: string) {
    assertStorageKey(prefix);
    const objects: StoredObjectInfo[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }));
      for (const object of page.Contents ?? []) if (object.Key) objects.push({ key: object.Key, byteSize: object.Size ?? 0, etag: object.ETag, lastModified: object.LastModified });
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
    return objects;
  }
}
