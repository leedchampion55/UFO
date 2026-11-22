import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_MULTIPART_REQUEST_BYTES = 52 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROCESSING_REQUESTS = 2;
const MAX_QUEUED_REQUESTS = 4;
let activeProcessingRequests = 0;
const processingQueue: Array<() => void> = [];

sharp.cache({ files: 0 });

async function acquireProcessingSlot() {
  if (activeProcessingRequests < MAX_PROCESSING_REQUESTS) { activeProcessingRequests += 1; return; }
  if (processingQueue.length >= MAX_QUEUED_REQUESTS) throw new Error("UPLOAD_BUSY");
  await new Promise<void>((resolve) => processingQueue.push(resolve));
  activeProcessingRequests += 1;
}

function releaseProcessingSlot() {
  activeProcessingRequests -= 1;
  processingQueue.shift()?.();
}

export function assertUploadRequestSize(request: Request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_MULTIPART_REQUEST_BYTES)) throw new Error("UPLOAD_TOTAL_SIZE");
}

export type PreparedImage = {
  id: string;
  originalFileName: string;
  buffer: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
};

export async function prepareImages(files: File[]): Promise<PreparedImage[]> {
  if (files.length > 5) throw new Error("UPLOAD_COUNT");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_FILE_BYTES) throw new Error("UPLOAD_TOTAL_SIZE");
  const prepared: PreparedImage[] = [];
  await acquireProcessingSlot();
  try {
    for (const file of files) {
      if (!file.size) continue;
      if (file.size > MAX_FILE_BYTES) throw new Error("UPLOAD_SIZE");
      const input = Buffer.from(await file.arrayBuffer());
      const detected = await fileTypeFromBuffer(input);
      if (!detected || !allowed.has(detected.mime)) throw new Error("UPLOAD_TYPE");

      const image = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error", sequentialRead: true });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw new Error("UPLOAD_PIXELS");
      const buffer = await image.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
      const output = await sharp(buffer).metadata();
      prepared.push({ id: randomUUID(), originalFileName: file.name.slice(0, 255), buffer, mimeType: "image/webp", width: output.width!, height: output.height! });
    }
    return prepared;
  } finally {
    releaseProcessingSlot();
  }
}

export function uploadErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "UPLOAD_COUNT") return "You can attach up to five photographs.";
  if (code === "UPLOAD_SIZE") return "Each photograph must be 10 MB or smaller.";
  if (code === "UPLOAD_TOTAL_SIZE") return "The complete upload must be 50 MB or smaller.";
  if (code === "UPLOAD_TYPE") return "Photographs must be genuine JPEG, PNG or WebP images.";
  if (code === "UPLOAD_PIXELS") return "One photograph is too large in pixel dimensions.";
  if (code === "UPLOAD_BUSY") return "Image processing is busy. Please wait briefly and try again.";
  return null;
}
