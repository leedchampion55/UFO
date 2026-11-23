import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createOTP } from "@better-auth/utils/otp";
import { Pool } from "pg";

const marker = randomUUID();
let adminEmail = "";
let adminPassword = "";
const memberEmail = `browser-member-${marker}@example.test`;
const memberPassword = "Browser-Member-Password-2026!";
const encounterTitle = `Browser smoke encounter ${marker.slice(0, 8)}`;
let adminSecret = new Uint8Array();
let encounterId = "";
let mediaId = "";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

function decodeBase32(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
  for (const character of value.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  return Uint8Array.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []);
}

async function signInAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Administrator email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByRole("button", { name: "Enter Mission Control" }).click();
  await page.waitForURL(/\/admin\/mfa\/verify/);
  await page.getByLabel("Six-digit code").fill(await createOTP(adminSecret).totp());
  await page.getByRole("button", { name: "Verify clearance" }).click();
  await page.waitForURL(/\/admin(?:\?|$)/);
}

test.beforeAll(async () => {
  const fixture = JSON.parse(await readFile(process.env.BROWSER_FIXTURE_PATH!, "utf8")) as { adminEmail: string; adminPassword: string; adminSecret: string };
  adminEmail = fixture.adminEmail; adminPassword = fixture.adminPassword; adminSecret = decodeBase32(fixture.adminSecret);
});
test.afterAll(async () => { await pool.end(); });

test.describe.serial("production journey smoke tests", () => {
  test("homepage, artwork, navigation, archive and health load", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('img[src*="reference-artwork"]')).toBeVisible();
    await page.getByRole("link", { name: /encounters/i }).first().click();
    await expect(page).toHaveURL(/\/encounters/);
    expect((await page.request.get("/health/live")).status()).toBe(200);
    expect((await page.request.get("/health/ready")).status()).toBe(200);
  });

  test("anonymous encounter submission remains private with protected evidence", async ({ page }) => {
    await page.goto("/report");
    await page.getByLabel("Encounter category").selectOption({ index: 1 });
    await page.getByLabel("A short title").fill(encounterTitle);
    await page.getByLabel("Tell us what you experienced").fill("A wholly fictional browser smoke-test account of strange lights above the Cornish coast, written only to validate the anonymous submission and private evidence workflow.");
    await page.getByLabel("Up to five optional photographs").setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await page.getByLabel(/I confirm this is my account/).check();
    await page.getByRole("button", { name: "Send to Mission Control" }).click();
    await expect(page.getByText("Transmission received", { exact: true })).toBeVisible();
    const encounter = await pool.query<{ id: string; status: string; mediaId: string }>('SELECT e.id, e.status, m.id AS "mediaId" FROM "Encounter" e JOIN "EncounterMedia" m ON m."encounterId" = e.id WHERE e.title = $1', [encounterTitle]);
    encounterId = encounter.rows[0]!.id; mediaId = encounter.rows[0]!.mediaId;
    expect(encounter.rows[0]!.status).toBe("PENDING");
    expect((await fetch(`http://127.0.0.1:3100/api/media/${mediaId}`)).status).toBe(404);
  });

  test("administrator MFA, review, publication and unpublishing revocation work", async ({ page }) => {
    await signInAdmin(page);
    await page.goto(`/admin/encounters/${encounterId}`);
    await expect(page.getByRole("heading", { name: encounterTitle })).toBeVisible();
    await page.getByRole("button", { name: "Approve and publish" }).click();
    await expect.poll(async () => (await pool.query<{ status: string }>('SELECT status::text FROM "Encounter" WHERE id = $1', [encounterId])).rows[0]!.status).toBe("PUBLISHED");
    expect((await page.request.get(`/api/media/${mediaId}`)).status()).toBe(200);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect.poll(async () => (await pool.query<{ status: string }>('SELECT status::text FROM "Encounter" WHERE id = $1', [encounterId])).rows[0]!.status).toBe("UNPUBLISHED");
    expect((await fetch(`http://127.0.0.1:3100/api/media/${mediaId}`)).status).toBe(404);
  });

  test("member registration, local verification and Mothership publishing work", async ({ browser }) => {
    const context: BrowserContext = await browser.newContext(); const page = await context.newPage();
    await page.goto("/register");
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Public username").fill(`browser_${marker.slice(0, 8)}`);
    await page.getByLabel("Password").fill(memberPassword);
    await page.getByRole("button", { name: "Create free account" }).click();
    await expect(page.getByRole("heading", { name: "Check your signal" })).toBeVisible();
    const mailRoot = process.env.DEV_MAIL_ROOT!;
    const messages = await Promise.all((await readdir(mailRoot)).filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(path.join(mailRoot, file), "utf8")) as { to: string; kind: string; actionUrl?: string }));
    const message = messages.find((email) => email.to === memberEmail && email.kind === "EMAIL_VERIFICATION");
    expect(message?.actionUrl).toBeTruthy();
    const verificationUrl = new URL(message!.actionUrl!); verificationUrl.protocol = "http:"; verificationUrl.host = "127.0.0.1:3100";
    await page.goto(verificationUrl.toString());
    await expect.poll(async () => (await pool.query<{ emailVerified: boolean }>('SELECT "emailVerified" FROM "user" WHERE email = $1', [memberEmail])).rows[0]!.emailVerified).toBe(true);
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(memberEmail);
    await page.getByLabel("Password").fill(memberPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account/);
    await expect(page.getByRole("link", { name: "My account" })).toBeVisible();
    await page.goto("/mothership/new");
    await page.getByLabel("Title").fill(`Browser discussion ${marker.slice(0, 8)}`);
    await page.getByLabel("Discussion").fill("A fictional browser smoke-test discussion that validates the complete member publishing journey without contacting external services.");
    await page.getByRole("button", { name: "Publish discussion" }).click();
    await expect(page).toHaveURL(/\/mothership\//);
    await expect(page.getByText(/fictional browser smoke-test discussion/i)).toBeVisible();
    await context.close();
  });
});

test("@mobile homepage and navigation remain usable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("header")).toBeVisible();
});
