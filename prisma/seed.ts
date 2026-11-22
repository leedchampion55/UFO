import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const categories = [
  { name: "UFOs & UAPs", slug: "ufos-uaps", description: "Unexplained lights and objects in the sky.", imagePath: "/category-ufo.webp", sortOrder: 1 },
  { name: "Ghosts & Hauntings", slug: "ghosts-hauntings", description: "Haunted places, presences and strange sounds.", imagePath: "/category-ghosts.webp", sortOrder: 2 },
  { name: "Strange Creatures", slug: "strange-creatures", description: "Unfamiliar silhouettes, tracks and folklore.", imagePath: "/category-creatures.webp", sortOrder: 3 },
  { name: "Cornish Mysteries", slug: "cornish-mysteries", description: "Local legends, ruins and enduring mysteries.", imagePath: "/category-cornish.webp", sortOrder: 4 },
];

for (const category of categories) {
  await prisma.category.upsert({ where: { slug: category.slug }, update: category, create: category });
}

const discussionCategories = [
  { name: "UFOs & UAPs", slug: "ufos-uaps", description: "Sightings, skywatching and unidentified aerial phenomena.", icon: "◉", sortOrder: 1 },
  { name: "Paranormal Experiences", slug: "paranormal-experiences", description: "Hauntings, presences and experiences beyond easy explanation.", icon: "✦", sortOrder: 2 },
  { name: "Cornish Mysteries", slug: "cornish-mysteries", description: "Local folklore, strange history and mysteries rooted in Cornwall.", icon: "⌖", sortOrder: 3 },
  { name: "Theories & Explanations", slug: "theories-explanations", description: "Thoughtful theories, ordinary explanations and open questions.", icon: "△", sortOrder: 4 },
  { name: "General Discussion", slug: "general-discussion", description: "Introductions and wider curious conversation.", icon: "◇", sortOrder: 5 },
];

for (const category of discussionCategories) {
  await prisma.discussionCategory.upsert({ where: { slug: category.slug }, update: category, create: category });
}

await prisma.$disconnect();
