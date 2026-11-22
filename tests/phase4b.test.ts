import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createOTP } from "@better-auth/utils/otp";
import nextConfig from "@/next.config";
import { POST as verifyAdminMfa } from "@/app/api/admin/mfa/verify/route";
import { POST as register } from "@/app/api/members/register/route";
import { auth, getAdminSession, STRONG_AUTH_WINDOW_MS } from "@/lib/auth";
import { validateRuntimeEnvironment } from "@/lib/env";
import { deleteDevelopmentEmailsForRecipient } from "@/lib/dev-mail";
import { assertUploadRequestSize } from "@/lib/media";
import { registerMemberAccount } from "@/lib/member-registration";
import { prisma } from "@/lib/prisma";
import { safeInternalPath } from "@/lib/redirects";
import { assertMutationRequest, cleanupExpiredRateLimits, enforceRateLimit } from "@/lib/security";
import { proxy } from "@/proxy";

const marker = randomUUID();
const password = "Phase-Four-B-Security-Password-2026!";
const adminEmail = `phase4b-admin-${marker}@example.test`;
const memberEmails: string[] = [];
let adminUserId = "";
let administratorId = "";

function baseHeaders(extra: Record<string, string> = {}) {
  return new Headers({ origin: "http://localhost:3000", "content-type": "application/json", "x-real-ip": randomUUID(), ...extra });
}

class CookieJar {
  values = new Map<string, string>();
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join("; "); }
  absorb(response: Response) {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const entries = headers.getSetCookie?.() ?? (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : []);
    for (const entry of entries) {
      const [pair] = entry.split(";"); const separator = pair.indexOf("=");
      const name = pair.slice(0, separator); const value = pair.slice(separator + 1);
      if (/max-age=0/i.test(entry) || !value) this.values.delete(name); else this.values.set(name, value);
    }
  }
}

async function authRequest(path: string, body: object, jar: CookieJar) {
  const headers = baseHeaders(jar.header() ? { cookie: jar.header() } : {});
  const response = await auth.handler(new Request(`http://localhost:3000/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  jar.absorb(response); return response;
}

async function adminVerify(method: "totp" | "recovery", code: string, jar: CookieJar) {
  const headers = baseHeaders(jar.header() ? { cookie: jar.header() } : {});
  const response = await verifyAdminMfa(new Request("http://localhost:3000/api/admin/mfa/verify", { method: "POST", headers, body: JSON.stringify({ method, code }) }));
  jar.absorb(response); return response;
}

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const character of value.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  return Uint8Array.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
}

describe("Phase 4B security hardening", { concurrency: false }, () => {
  after(async () => {
    if (administratorId) await prisma.communityModeration.deleteMany({ where: { administratorId } });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, ...memberEmails] } } });
    for (const email of memberEmails) await deleteDevelopmentEmailsForRecipient(email);
    await prisma.requestRateLimit.deleteMany({ where: { purpose: { startsWith: `phase4b-${marker}` } } });
    await prisma.$disconnect();
  });

  it("rejects external, protocol-relative, backslash and encoded separator redirects", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "/%5cevil", "/%2f%2fevil"]) assert.equal(safeInternalPath(value, "/safe"), "/safe");
    assert.equal(safeInternalPath("/mothership?page=2", "/safe"), "/mothership?page=2");
  });

  it("accepts trusted browser mutations and rejects forged or ambiguous origins", () => {
    assert.doesNotThrow(() => assertMutationRequest(new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000" } })));
    assert.doesNotThrow(() => assertMutationRequest(new Request("http://localhost:3000/api/test", { method: "POST", headers: { "sec-fetch-site": "same-origin" } })));
    assert.throws(() => assertMutationRequest(new Request("http://localhost:3000/api/test", { method: "POST" })), /INVALID_ORIGIN/);
    assert.throws(() => assertMutationRequest(new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "https://evil.example" } })), /INVALID_ORIGIN/);
    assert.throws(() => assertMutationRequest(new Request("http://localhost:3000/api/test", { method: "POST", headers: { origin: "http://localhost:3000", "sec-fetch-site": "cross-site" } })), /INVALID_ORIGIN/);
  });

  it("emits a nonce CSP and the configured response security headers", async () => {
    const response = proxy(new NextRequest("http://localhost:3000/"));
    const csp = response.headers.get("content-security-policy") ?? "";
    assert.match(csp, /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/); assert.match(csp, /frame-ancestors 'none'/); assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    const definitions = await nextConfig.headers!(); const map = new Map(definitions[0]!.headers.map((header) => [header.key, header.value]));
    assert.equal(map.get("X-Content-Type-Options"), "nosniff"); assert.equal(map.get("X-Frame-Options"), "DENY"); assert.ok(map.has("Permissions-Policy"));
  });

  it("rejects insecure production environment values while preserving local configuration", () => {
    const local: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" }; assert.equal(validateRuntimeEnvironment(local).STORAGE_DRIVER, "local");
    assert.throws(() => validateRuntimeEnvironment({ ...local, NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), /production application origin/);
    assert.throws(() => validateRuntimeEnvironment({ ...local, NODE_ENV: "production", APP_RUNTIME_MODE: "production", BETTER_AUTH_URL: "https://ufo.example", NEXT_PUBLIC_APP_URL: "https://ufo.example", DATABASE_URL: "postgresql://ufo:secret@db.example/ufo", DIRECT_URL: "postgresql://ufo:secret@db.example/ufo", TRUSTED_PROXY_MODE: "railway", STORAGE_DRIVER: "r2", EMAIL_DRIVER: "resend" }), /Phase 4C/);
  });

  it("enforces declared aggregate upload size before parsing multipart data", () => {
    assert.throws(() => assertUploadRequestSize(new Request("http://localhost/upload", { method: "POST", headers: { "content-length": String(53 * 1024 * 1024) } })), /UPLOAD_TOTAL_SIZE/);
    assert.doesNotThrow(() => assertUploadRequestSize(new Request("http://localhost/upload", { method: "POST", headers: { "content-length": "1024" } })));
  });

  it("does not trust forwarded client chains outside the configured proxy mode", async () => {
    const previous = process.env.TRUSTED_PROXY_MODE; process.env.TRUSTED_PROXY_MODE = "none";
    const purpose = `phase4b-${marker}-proxy`;
    try {
      await enforceRateLimit(new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.1", "x-forwarded-for": "198.51.100.2" } }), purpose, 1, 3600);
      await assert.rejects(() => enforceRateLimit(new Request("http://localhost", { headers: { "x-real-ip": "203.0.113.1" } }), purpose, 1, 3600), /RATE_LIMITED/);
    } finally { if (previous === undefined) delete process.env.TRUSTED_PROXY_MODE; else process.env.TRUSTED_PROXY_MODE = previous; }
  });

  it("cleans expired rate-limit rows", async () => {
    const purpose = `phase4b-${marker}-old`; await prisma.requestRateLimit.create({ data: { purpose, keyHash: marker, windowStart: new Date(0), requestCount: 1 } });
    await cleanupExpiredRateLimits(); assert.equal(await prisma.requestRateLimit.count({ where: { purpose } }), 0);
  });

  it("compensates a member-profile failure without leaving an authentication user", async () => {
    const email = `phase4b-failure-${marker}@example.test`; memberEmails.push(email);
    await assert.rejects(() => registerMemberAccount({ email, username: `failure_${marker.slice(0, 8)}`, password }, baseHeaders(), async () => { throw new Error("INJECTED_PROFILE_FAILURE"); }));
    assert.equal(await prisma.user.count({ where: { email } }), 0);
  });

  it("allows only one concurrent registration for a canonical username", async () => {
    const username = `collision_${marker.slice(0, 8)}`; const emails = [`phase4b-a-${marker}@example.test`, `phase4b-b-${marker}@example.test`]; memberEmails.push(...emails);
    const responses = await Promise.all(emails.map((email, index) => register(new Request("http://localhost:3000/api/members/register", { method: "POST", headers: baseHeaders({ "x-real-ip": `192.0.2.${index + 1}` }), body: JSON.stringify({ email, username, password, website: "" }) }))));
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    assert.equal(await prisma.memberProfile.count({ where: { usernameCanonical: username.toLowerCase() } }), 1);
    assert.equal(await prisma.user.count({ where: { email: { in: emails } } }), 1);
  });

  it("enrols administrator TOTP, rejects an invalid code and records strong authentication", async () => {
    const created = await auth.api.createUser({ body: { email: adminEmail, name: "Phase 4B Admin", password, role: "admin" } }); adminUserId = created.user.id;
    administratorId = (await prisma.administrator.create({ data: { userId: adminUserId, displayName: "Phase 4B Admin", role: "OWNER" } })).id;
    const jar = new CookieJar(); assert.equal((await authRequest("/sign-in/email", { email: adminEmail, password, rememberMe: false }, jar)).status, 200);
    const enabledResponse = await authRequest("/two-factor/enable", { password, method: "totp", issuer: "What the UFO?! Mission Control" }, jar); assert.equal(enabledResponse.status, 200);
    const enabled = await enabledResponse.json() as { totpURI: string; backupCodes: string[] }; assert.equal(enabled.backupCodes.length, 10);
    const secret = decodeBase32(new URL(enabled.totpURI).searchParams.get("secret")!); const validCode = await createOTP(secret).totp();
    assert.equal((await adminVerify("totp", "000000", jar)).status, 401);
    assert.equal((await adminVerify("totp", validCode, jar)).status, 200);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: adminUserId } }); assert.equal(user.twoFactorEnabled, true);
    const strong = await prisma.session.findFirstOrThrow({ where: { userId: adminUserId }, orderBy: { createdAt: "desc" } }); assert.ok(strong.strongAuthAt); assert.ok(Date.now() - strong.strongAuthAt!.getTime() < STRONG_AUTH_WINDOW_MS);

    await authRequest("/sign-out", {}, jar); const signIn = await authRequest("/sign-in/email", { email: adminEmail, password, rememberMe: false }, jar); const challenge = await signIn.json() as { twoFactorRedirect?: boolean }; assert.equal(challenge.twoFactorRedirect, true);
    const nextCode = await createOTP(secret).totp(); assert.equal((await adminVerify("totp", nextCode, jar)).status, 200);

    await authRequest("/sign-out", {}, jar); await authRequest("/sign-in/email", { email: adminEmail, password, rememberMe: false }, jar);
    const recovery = enabled.backupCodes[0]!; assert.equal((await adminVerify("recovery", recovery, jar)).status, 200);
    await authRequest("/sign-out", {}, jar); await authRequest("/sign-in/email", { email: adminEmail, password, rememberMe: false }, jar);
    assert.equal((await adminVerify("recovery", recovery, jar)).status, 401);
    assert.equal((await adminVerify("totp", await createOTP(secret).totp(), jar)).status, 200);
    await prisma.administrator.update({ where: { id: administratorId }, data: { active: false } });
    assert.equal(await getAdminSession(new Headers({ cookie: jar.header() })), null);
    assert.equal(await prisma.session.count({ where: { userId: adminUserId } }), 0);
    await prisma.administrator.update({ where: { id: administratorId }, data: { active: true } });
  });

  it("revokes established sessions when a password is reset and consumes the reset token", async () => {
    const email = `phase4b-reset-${marker}@example.test`; memberEmails.push(email);
    const created = await auth.api.signUpEmail({ body: { email, password, name: "reset_member" } });
    await auth.api.signInEmail({ body: { email, password } }); await auth.api.signInEmail({ body: { email, password } });
    assert.ok(await prisma.session.count({ where: { userId: created.user.id } }) >= 2);
    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
    const verification = await prisma.verification.findFirstOrThrow({ where: { identifier: { startsWith: "reset-password:" } }, orderBy: { createdAt: "desc" } });
    const token = verification.identifier.split(":").at(-1)!; const newPassword = `${password}-Changed`;
    await auth.api.resetPassword({ body: { token, newPassword } }); assert.equal(await prisma.session.count({ where: { userId: created.user.id } }), 0);
    await assert.rejects(() => auth.api.resetPassword({ body: { token, newPassword: `${newPassword}-Again` } }));
  });
});
