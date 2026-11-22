import { randomBytes } from "node:crypto";
import { z } from "zod";

export const submissionSchema = z.object({
  categoryId: z.string().uuid("Choose a valid encounter category."),
  title: z.string().trim().min(5, "Give your encounter a slightly longer title.").max(140),
  description: z.string().trim().min(80, "Please tell us a little more about what happened.").max(30000),
  approximateDate: z.string().trim().max(120).optional().or(z.literal("")),
  approximateTime: z.string().trim().max(80).optional().or(z.literal("")),
  approximateLocation: z.string().trim().max(200).optional().or(z.literal("")),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  witnessCount: z.coerce.number().int().min(1).max(1000).optional().or(z.literal("")),
  displayName: z.string().trim().max(100).optional().or(z.literal("")),
  privateEmail: z.string().trim().email("Enter a valid email address.").max(254).optional().or(z.literal("")),
  publishAnonymously: z.preprocess((value) => value === "true" || value === "on" || value === true, z.boolean()).default(false),
  publicationConsent: z.literal("true", { message: "You must confirm the submission rules." }),
  videoLinks: z.string().trim().max(2000).optional().or(z.literal("")),
  website: z.string().max(0, "Automated submission detected.").optional().or(z.literal("")),
});

export function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "encounter";
}

export function createCaseReference() {
  const year = new Date().getUTCFullYear();
  return `WTU-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export function createStableSlug(title: string) {
  return `${slugify(title)}-${randomBytes(3).toString("hex")}`;
}

export function parseVideoLinks(raw?: string) {
  if (!raw) return [];
  const links = raw.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean);
  if (links.length > 5) throw new Error("VIDEO_LINKS_INVALID");
  return links.map((value) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"].includes(url.hostname)) throw new Error("VIDEO_LINKS_INVALID");
    return url.toString();
  });
}
