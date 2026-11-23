import { z } from "zod";

const PLACEHOLDER = /(replace-with|changeme|example-secret|better-auth-secret)/i;
const PROVIDER_PLACEHOLDER = /(replace|changeme|example)/i;

function validHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

function senderAddress(value: string) {
  return value.match(/(?:^|<)([^<>\s]+@[^<>\s]+)(?:>|$)/)?.[1]?.toLowerCase();
}

function validR2Endpoint(value: string, production: boolean) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    if (production) return url.protocol === "https:" && url.pathname === "/" && url.hostname.endsWith(".r2.cloudflarestorage.com");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch { return false; }
}

export function trustedApplicationOrigins() {
  const values = [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL, ...(process.env.TRUSTED_APP_ORIGINS ?? "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(values.filter(validHttpOrigin))];
}

export function validateRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  // An explicit local mode permits `next start` browser validation against the
  // local database. Railway must omit it or set production.
  const production = environment.NODE_ENV === "production" && environment.APP_RUNTIME_MODE !== "local";
  const schema = z.object({
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().refine(validHttpOrigin, "must be an absolute HTTP(S) origin"),
    NEXT_PUBLIC_APP_URL: z.string().refine(validHttpOrigin, "must be an absolute HTTP(S) origin"),
    RATE_LIMIT_SECRET: z.string().min(32),
    STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
    EMAIL_DRIVER: z.enum(["development", "resend"]).default("development"),
    TRUSTED_PROXY_MODE: z.enum(["none", "local", "railway"]).default("local"),
    APP_RUNTIME_MODE: z.enum(["local", "production"]).optional(),
    RESEND_API_KEY: z.string().min(20).optional(),
    RESEND_FROM: z.string().min(3).optional(),
    RESEND_SENDING_DOMAIN: z.string().min(3).optional(),
    RESEND_WEBHOOK_SECRET: z.string().min(20).optional(),
    ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
    R2_ENDPOINT: z.string().optional(),
    R2_BUCKET: z.string().min(3).max(63).optional(),
    R2_ACCESS_KEY_ID: z.string().min(8).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(16).optional(),
    R2_REGION: z.string().min(1).default("auto"),
    R2_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
    PUBLIC_SUBMISSIONS_ENABLED: z.enum(["true", "false"]).default("true"),
    RELEASE_SHA: z.string().max(128).optional(),
    ERROR_MONITORING_ENDPOINT: z.string().url().optional(),
    ERROR_MONITORING_TOKEN: z.string().min(20).optional(),
  });
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid runtime environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);

  if (PLACEHOLDER.test(parsed.data.BETTER_AUTH_SECRET) || PLACEHOLDER.test(parsed.data.RATE_LIMIT_SECRET)) {
    throw new Error("Invalid runtime environment: placeholder security secrets are not allowed");
  }
  if (parsed.data.BETTER_AUTH_SECRET === parsed.data.RATE_LIMIT_SECRET) {
    throw new Error("Invalid runtime environment: authentication and rate-limit secrets must be different");
  }
  if (parsed.data.BETTER_AUTH_URL !== parsed.data.NEXT_PUBLIC_APP_URL) {
    throw new Error("Invalid runtime environment: BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must use the same canonical origin");
  }
  const additionalOrigins = (environment.TRUSTED_APP_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (additionalOrigins.some((origin) => !validHttpOrigin(origin))) throw new Error("Invalid runtime environment: every trusted origin must be an exact HTTP(S) origin");
  if (parsed.data.EMAIL_DRIVER === "resend") {
    if (!parsed.data.RESEND_API_KEY || !parsed.data.RESEND_FROM || !parsed.data.RESEND_SENDING_DOMAIN || !parsed.data.RESEND_WEBHOOK_SECRET || !parsed.data.ADMIN_NOTIFICATION_EMAIL) throw new Error("Invalid runtime environment: Resend configuration is incomplete");
    const from = senderAddress(parsed.data.RESEND_FROM);
    const fromDomain = from?.split("@")[1];
    if (!fromDomain || !(fromDomain === parsed.data.RESEND_SENDING_DOMAIN || fromDomain.endsWith(`.${parsed.data.RESEND_SENDING_DOMAIN}`))) throw new Error("Invalid runtime environment: RESEND_FROM must use the configured sending domain");
  }
  if (parsed.data.STORAGE_DRIVER === "r2") {
    if (!parsed.data.R2_ENDPOINT || !parsed.data.R2_BUCKET || !parsed.data.R2_ACCESS_KEY_ID || !parsed.data.R2_SECRET_ACCESS_KEY || !validR2Endpoint(parsed.data.R2_ENDPOINT, production)) throw new Error("Invalid runtime environment: R2 configuration is incomplete or invalid");
  }
  if (production) {
    const app = new URL(parsed.data.NEXT_PUBLIC_APP_URL);
    const database = new URL(parsed.data.DATABASE_URL);
    const directDatabase = new URL(parsed.data.DIRECT_URL);
    if (app.protocol !== "https:") throw new Error("Invalid runtime environment: the production application origin must use HTTPS");
    if (["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error("Invalid runtime environment: the production database must not point to localhost");
    if (["localhost", "127.0.0.1", "::1"].includes(directDatabase.hostname)) throw new Error("Invalid runtime environment: the production migration database must not point to localhost");
    if (database.searchParams.get("sslmode") !== "require" || directDatabase.searchParams.get("sslmode") !== "require") throw new Error("Invalid runtime environment: production database connections must require TLS");
    if (!database.hostname.includes("-pooler.") && database.hostname.endsWith(".neon.tech")) throw new Error("Invalid runtime environment: DATABASE_URL must use the Neon pooled endpoint");
    if (directDatabase.hostname.includes("-pooler.") && directDatabase.hostname.endsWith(".neon.tech")) throw new Error("Invalid runtime environment: DIRECT_URL must use the Neon direct endpoint");
    if (parsed.data.ERROR_MONITORING_ENDPOINT && new URL(parsed.data.ERROR_MONITORING_ENDPOINT).protocol !== "https:") throw new Error("Invalid runtime environment: production error monitoring must use HTTPS");
    if (parsed.data.TRUSTED_PROXY_MODE !== "railway") throw new Error("Invalid runtime environment: production proxy trust must be explicitly configured for Railway");
    if (parsed.data.STORAGE_DRIVER !== "r2" || parsed.data.EMAIL_DRIVER !== "resend") {
      throw new Error("Invalid runtime environment: production requires the Phase 4C R2 and Resend drivers");
    }
    if ([parsed.data.RESEND_API_KEY, parsed.data.RESEND_WEBHOOK_SECRET, parsed.data.R2_ACCESS_KEY_ID, parsed.data.R2_SECRET_ACCESS_KEY].some((value) => !value || PROVIDER_PLACEHOLDER.test(value))) throw new Error("Invalid runtime environment: production provider credentials must not be placeholders");
    if (parsed.data.R2_FORCE_PATH_STYLE === "true") throw new Error("Invalid runtime environment: production R2 must not use path-style addressing");
  }
  return parsed.data;
}
