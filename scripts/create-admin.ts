import "dotenv/config";
import { z } from "zod";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

const input = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(12).max(128),
}).parse({
  email: process.env.ADMIN_EMAIL,
  name: process.env.ADMIN_NAME,
  password: process.env.ADMIN_PASSWORD,
});

const existing = await prisma.user.findUnique({ where: { email: input.email } });
if (existing) throw new Error("An authentication user already exists with that email. No changes were made.");

const created = await auth.api.createUser({
  body: { email: input.email, name: input.name, password: input.password, role: "admin" },
});

await prisma.administrator.create({
  data: { userId: created.user.id, displayName: input.name, role: "OWNER" },
});

console.log(`Administrator created for ${input.email}. The password was not printed or stored in project files.`);
await prisma.$disconnect();
