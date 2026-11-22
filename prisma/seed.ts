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

await prisma.$disconnect();
