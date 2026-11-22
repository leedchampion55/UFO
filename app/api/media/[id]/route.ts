import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { privateStorage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await prisma.encounterMedia.findUnique({ where: { id }, include: { encounter: { select: { status: true, deletedAt: true } } } });
  if (!media || media.removedAt) return new Response("Not found", { status: 404 });
  const admin = await getAdminSession(request.headers);
  const isPublic = media.encounter.status === "PUBLISHED" && !media.encounter.deletedAt && Boolean(media.approvedAt);
  if (!admin && !isPublic) return new Response("Not found", { status: 404 });
  try {
    const bytes = await privateStorage.get(media.storageKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(bytes.byteLength),
        // Publication and media approval can be revoked at any time. Never let a
        // browser or intermediary retain a copy beyond the current access check.
        "Cache-Control": "private, no-store, max-age=0",
        "Vary": "Cookie",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
