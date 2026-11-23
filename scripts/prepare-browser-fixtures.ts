import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const fixturePath = process.env.BROWSER_FIXTURE_PATH;
if (!fixturePath) throw new Error("BROWSER_FIXTURE_PATH is required");
const suffix = crypto.randomUUID();
const email = `browser-admin-${suffix}@example.test`;
const password = "Browser-Admin-Password-2026!";
const created = await auth.api.createUser({ body: { email, name: "Browser Admin", password, role: "admin" } });
await prisma.administrator.create({ data: { userId: created.user.id, displayName: "Browser Admin", role: "OWNER" } });

const cookies = new Map<string, string>();
const call = async (path: string, body: object) => {
  const response = await auth.handler(new Request(`${process.env.BETTER_AUTH_URL}/api/auth${path}`, { method: "POST", headers: { origin: process.env.BETTER_AUTH_URL!, "content-type": "application/json", cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") }, body: JSON.stringify(body) }));
  for (const entry of (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? []) { const [pair] = entry.split(";"); const index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
  return response;
};
await call("/sign-in/email", { email, password, rememberMe: false });
const enabled = await (await call("/two-factor/enable", { password, method: "totp", issuer: "What the UFO?! Mission Control" })).json() as { totpURI: string };
const secret = new URL(enabled.totpURI).searchParams.get("secret");
if (!secret) throw new Error("TOTP fixture setup failed");
await prisma.$transaction([
  prisma.user.update({ where: { id: created.user.id }, data: { twoFactorEnabled: true } }),
  prisma.twoFactor.updateMany({ where: { userId: created.user.id }, data: { verified: true } }),
  prisma.session.deleteMany({ where: { userId: created.user.id } }),
]);
await writeFile(fixturePath, JSON.stringify({ adminEmail: email, adminPassword: password, adminSecret: secret }), { mode: 0o600 });
await prisma.$disconnect();
