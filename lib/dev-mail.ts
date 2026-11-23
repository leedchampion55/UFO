import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type DevelopmentEmail = {
  to: string;
  subject: string;
  kind: "EMAIL_VERIFICATION" | "PASSWORD_RESET" | "PASSWORD_RESET_SECURITY" | "ACCOUNT_SECURITY" | "ENCOUNTER_SUBMITTED" | "COMMUNITY_REPORT";
  actionUrl?: string;
  text?: string;
};

export async function deliverDevelopmentEmail(message: DevelopmentEmail) {
  if (process.env.NODE_ENV === "production" && process.env.APP_RUNTIME_MODE !== "local") {
    throw new Error("A production transactional email transport must be configured before member email can be sent.");
  }
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DEV_MAIL_ROOT ?? ".data/dev-mail");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const file = path.join(root, `${Date.now()}-${randomUUID()}.json`);
  await writeFile(file, JSON.stringify({ ...message, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
}

export async function listDevelopmentEmails() {
  if (process.env.NODE_ENV === "production") return [];
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DEV_MAIL_ROOT ?? ".data/dev-mail");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const files = (await readdir(root)).filter((file) => file.endsWith(".json")).sort().reverse().slice(0, 30);
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(root, file), "utf8")) as DevelopmentEmail & { createdAt: string }));
}

export async function deleteDevelopmentEmailsForRecipient(recipient: string) {
  if (process.env.NODE_ENV === "production") return;
  const root = path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DEV_MAIL_ROOT ?? ".data/dev-mail");
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const file of (await readdir(root)).filter((item) => item.endsWith(".json"))) {
    const message = JSON.parse(await readFile(path.join(root, file), "utf8")) as DevelopmentEmail;
    if (message.to === recipient) await unlink(path.join(root, file));
  }
}
