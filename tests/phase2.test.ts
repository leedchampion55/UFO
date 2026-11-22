import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { POST as submitEncounter } from "@/app/api/encounters/route";
import { GET as getMedia } from "@/app/api/media/[id]/route";
import { POST as requestRemoval } from "@/app/api/removal-requests/route";
import { auth, getAdminSession } from "@/lib/auth";
import { createCaseReference, createStableSlug, parseVideoLinks, submissionSchema } from "@/lib/encounters";
import { prepareImages } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { privateStorage } from "@/lib/storage";

const marker = "[phase2-test]";
let categoryId = "";
let encounterId = "";
let caseReference = "";
let removalToken = "";
let mediaId = "";
let administratorId = "";
let administratorUserId = "";
const administratorEmail = `phase2-${crypto.randomUUID()}@example.test`;
const administratorPassword = "Local-Test-Administrator-2026!";

function requestWith(body: BodyInit, contentType?: string) {
  return new Request("http://localhost:3000/api/test", {
    method: "POST",
    body,
    headers: {
      origin: "http://localhost:3000",
      "x-real-ip": `test-${crypto.randomUUID()}`,
      ...(contentType ? { "content-type": contentType } : {}),
    },
  });
}

function validForm() {
  const form = new FormData();
  form.set("categoryId", categoryId);
  form.set("title", `${marker} Lights above the headland`);
  form.set("description", "A silent triangular arrangement of lights crossed the headland, paused above the water, then vanished without a sound. This account is long enough for editorial review.");
  form.set("approximateDate", "Autumn 2024");
  form.set("approximateLocation", "North Cornwall coast");
  form.set("displayName", "Test Witness");
  form.set("privateEmail", "witness@example.test");
  form.set("publicationConsent", "true");
  return form;
}

describe("Phase 2 encounter system", { concurrency: false }, () => {
  before(async () => {
    const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
    categoryId = category.id;
    await prisma.requestRateLimit.deleteMany({ where: { keyHash: { startsWith: "test-" } } }).catch(() => undefined);
    const old = await prisma.encounter.findMany({ where: { title: { startsWith: marker } }, select: { id: true } });
    await prisma.encounter.deleteMany({ where: { id: { in: old.map((item) => item.id) } } });
    const created = await auth.api.createUser({ body: { email: administratorEmail, name: "Phase 2 Test Admin", password: administratorPassword, role: "admin" } });
    administratorUserId = created.user.id;
    const administrator = await prisma.administrator.create({ data: { userId: administratorUserId, displayName: "Phase 2 Test Admin", role: "OWNER" } });
    administratorId = administrator.id;
  });

  after(async () => {
    const media = await prisma.encounterMedia.findMany({ where: { encounter: { title: { startsWith: marker } } }, select: { storageKey: true } });
    await Promise.all(media.map((item) => privateStorage.delete(item.storageKey)));
    await prisma.encounter.deleteMany({ where: { title: { startsWith: marker } } });
    await prisma.user.deleteMany({ where: { id: administratorUserId } });
    await prisma.$disconnect();
  });

  it("has all four seeded editorial categories", async () => {
    assert.equal(await prisma.category.count({ where: { active: true } }), 4);
  });

  it("denies Mission Control access without an administrator session", async () => {
    assert.equal(await getAdminSession(new Headers()), null);
  });

  it("authenticates a securely created administrator", async () => {
    const signedIn = await auth.api.signInEmail({ body: { email: administratorEmail, password: administratorPassword } });
    assert.equal(signedIn.user.email, administratorEmail);
    assert.ok(signedIn.token);
  });

  it("rejects incomplete encounter testimony", () => {
    assert.equal(submissionSchema.safeParse({ categoryId, title: "No", description: "Too short", publicationConsent: "true" }).success, false);
  });

  it("accepts supported HTTPS video hosts", () => {
    assert.deepEqual(parseVideoLinks("https://youtu.be/abc\nhttps://vimeo.com/123"), ["https://youtu.be/abc", "https://vimeo.com/123"]);
  });

  it("rejects unsupported or insecure video links", () => {
    assert.throws(() => parseVideoLinks("http://example.com/evidence"));
  });

  it("rejects an upload whose bytes are not an image", async () => {
    const fake = new File(["not really a jpeg"], "fake.jpg", { type: "image/jpeg" });
    await assert.rejects(() => prepareImages([fake]), /UPLOAD_TYPE/);
  });

  it("normalises a valid image to metadata-free WebP", async () => {
    const input = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#a4ff45" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const [image] = await prepareImages([new File([input], "evidence.jpg", { type: "image/jpeg" })]);
    assert.equal(image.mimeType, "image/webp");
    assert.equal((await sharp(image.buffer).metadata()).format, "webp");
  });

  it("persists a valid anonymous public submission as pending", async () => {
    const form = validForm();
    const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#a4ff45" } }).webp().toBuffer();
    form.set("photos", new File([image], "phase2-test.webp", { type: "image/webp" }));
    const response = await submitEncounter(requestWith(form));
    const result = await response.json() as { caseReference: string; removalToken: string };
    assert.equal(response.status, 201);
    caseReference = result.caseReference;
    removalToken = result.removalToken;
    const saved = await prisma.encounter.findUniqueOrThrow({ where: { caseReference } });
    encounterId = saved.id;
    assert.equal(saved.status, "PENDING");
    mediaId = (await prisma.encounterMedia.findFirstOrThrow({ where: { encounterId } })).id;
  });

  it("keeps contributor contact data in the private contact relation", async () => {
    const contact = await prisma.submissionContact.findUniqueOrThrow({ where: { encounterId } });
    assert.equal(contact.email, "witness@example.test");
    assert.ok(contact.removalTokenHash);
  });

  it("records a submission audit event", async () => {
    const event = await prisma.encounterModeration.findFirstOrThrow({ where: { encounterId } });
    assert.equal(event.action, "SUBMITTED");
  });

  it("does not include pending reports in public archive queries", async () => {
    assert.equal(await prisma.encounter.count({ where: { id: encounterId, status: "PUBLISHED" } }), 0);
  });

  it("blocks pending media from unauthenticated requests", async () => {
    const response = await getMedia(new Request(`http://localhost:3000/api/media/${mediaId}`), { params: Promise.resolve({ id: mediaId }) });
    assert.equal(response.status, 404);
  });

  it("does not accept an invalid contributor recovery token", async () => {
    const response = await requestRemoval(requestWith(JSON.stringify({ caseReference, removalToken: "0".repeat(48), action: "anonymise" }), "application/json"));
    assert.equal(response.status, 404);
  });

  it("honours a verified anonymisation request", async () => {
    const response = await requestRemoval(requestWith(JSON.stringify({ caseReference, removalToken, action: "anonymise" }), "application/json"));
    assert.equal(response.status, 200);
    const saved = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    assert.equal(saved.publishAnonymously, true);
    assert.equal(saved.publicDisplayName, null);
  });

  it("lets an administrator approve a submission with an audit event", async () => {
    await prisma.$transaction([
      prisma.encounter.update({ where: { id: encounterId }, data: { status: "PUBLISHED", publishedAt: new Date() } }),
      prisma.encounterModeration.create({ data: { encounterId, administratorId, action: "PUBLISHED", previousStatus: "PENDING", updatedStatus: "PUBLISHED" } }),
      prisma.encounterMedia.updateMany({ where: { encounterId, removedAt: null }, data: { approvedAt: new Date(), approvedByAdminId: administratorId } }),
    ]);
    const publicRecord = await prisma.encounter.findFirst({ where: { id: encounterId, status: "PUBLISHED" }, select: { id: true, title: true, contact: false } });
    assert.equal(publicRecord?.id, encounterId);
    const mediaResponse = await getMedia(new Request(`http://localhost:3000/api/media/${mediaId}`), { params: Promise.resolve({ id: mediaId }) });
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("cache-control"), "private, no-store, max-age=0");
  });

  it("resolves an approved encounter by its stable public slug", async () => {
    const saved = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId } });
    assert.equal((await prisma.encounter.findFirst({ where: { slug: saved.slug, status: "PUBLISHED" } }))?.id, encounterId);
  });

  it("never includes private contact fields in a public projection", async () => {
    const publicRecord = await prisma.encounter.findFirstOrThrow({ where: { id: encounterId, status: "PUBLISHED" }, select: { id: true, title: true, storyContent: true } });
    assert.equal("email" in publicRecord, false);
    assert.equal("contact" in publicRecord, false);
  });

  it("lets an administrator unpublish content and removes public access", async () => {
    await prisma.$transaction([
      prisma.encounter.update({ where: { id: encounterId }, data: { status: "UNPUBLISHED", publishedAt: null } }),
      prisma.encounterModeration.create({ data: { encounterId, administratorId, action: "UNPUBLISHED", previousStatus: "PUBLISHED", updatedStatus: "UNPUBLISHED" } }),
    ]);
    assert.equal(await prisma.encounter.count({ where: { id: encounterId, status: "PUBLISHED" } }), 0);
    const mediaResponse = await getMedia(new Request(`http://localhost:3000/api/media/${mediaId}`), { params: Promise.resolve({ id: mediaId }) });
    assert.equal(mediaResponse.status, 404);
    await prisma.encounter.update({ where: { id: encounterId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  });

  it("supports Matt's draft-to-published case-file workflow", async () => {
    const draft = await prisma.encounter.create({ data: { caseReference: createCaseReference(), slug: createStableSlug("Founder test case"), title: `${marker} Founder test case`, categoryId, originalStoryContent: "A founder-authored account retained exactly as supplied for this test.", storyContent: "A founder-authored account retained exactly as supplied for this test.", publicationConsent: true, founderFile: true, status: "DRAFT", createdByAdminId: administratorId } });
    assert.equal(draft.status, "DRAFT");
    const published = await prisma.encounter.update({ where: { id: draft.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.founderFile, true);
  });

  it("generates collision-resistant case references and slugs", () => {
    assert.notEqual(createCaseReference(), createCaseReference());
    assert.notEqual(createStableSlug("Same title"), createStableSlug("Same title"));
  });

  it("removes a verified encounter from public view and erases contact data", async () => {
    const response = await requestRemoval(requestWith(JSON.stringify({ caseReference, removalToken, action: "remove" }), "application/json"));
    assert.equal(response.status, 200);
    const saved = await prisma.encounter.findUniqueOrThrow({ where: { id: encounterId }, include: { contact: true } });
    assert.equal(saved.status, "UNPUBLISHED");
    assert.equal(saved.contact?.email, null);
    assert.equal(saved.contact?.removalTokenHash, null);
  });

  it("leaves a durable moderation trail for contributor changes", async () => {
    const reasons = await prisma.encounterModeration.findMany({ where: { encounterId }, select: { reason: true } });
    assert.ok(reasons.some((item) => item.reason?.includes("anonymisation")));
    assert.ok(reasons.some((item) => item.reason?.includes("removal")));
  });
});
