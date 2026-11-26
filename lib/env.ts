import { z } from "zod";
import { stagingGatewayConfiguration } from "./staging-gateway";

const PLACEHOLDER = /(replace-with|changeme|example-secret|better-auth-secret)/i;
const PROVIDER_PLACEHOLDER = /(replace|changeme|example)/i;

export type ServiceRole =
  | "web"
  | "email-worker"
  | "email-maintenance"
  | "rate-limit-maintenance"
  | "media-maintenance"
  | "media-backup"
  | "migration"
  | "database-backup";

export type ValidatedServiceEnvironment = NodeJS.ProcessEnv & {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
  STORAGE_DRIVER?: "local" | "r2";
  EMAIL_DRIVER?: "development" | "resend";
  TRUSTED_PROXY_MODE?: "none" | "local" | "railway";
};

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

function productionMode(environment: NodeJS.ProcessEnv) {
  return environment.NODE_ENV === "production" && environment.APP_RUNTIME_MODE !== "local";
}

function parseEnvironment(role: ServiceRole, schema: z.ZodType, environment: NodeJS.ProcessEnv) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error(`Invalid ${role} environment: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  return { ...environment, ...(parsed.data as Record<string, string | number | undefined>) } as ValidatedServiceEnvironment;
}

function rejectForbidden(role: ServiceRole, environment: NodeJS.ProcessEnv, names: string[], production: boolean) {
  if (!production) return;
  const supplied = names.filter((name) => environment[name] !== undefined && environment[name] !== "");
  if (supplied.length) throw new Error(`Invalid ${role} environment: privileged variables are not allowed (${supplied.join(", ")})`);
}

function validateRuntimeDatabase(role: ServiceRole, value: string, production: boolean) {
  if (!production) return;
  const database = new URL(value);
  if (["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error(`Invalid ${role} environment: production database must not point to localhost`);
  if (database.searchParams.get("sslmode") !== "require") throw new Error(`Invalid ${role} environment: production database connections must require TLS`);
  if (!database.hostname.includes("-pooler.") && database.hostname.endsWith(".neon.tech")) throw new Error(`Invalid ${role} environment: DATABASE_URL must use the Neon pooled endpoint`);
}

function validateDirectDatabase(role: ServiceRole, value: string, production: boolean) {
  if (!production) return;
  const database = new URL(value);
  if (["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error(`Invalid ${role} environment: production database must not point to localhost`);
  if (database.searchParams.get("sslmode") !== "require") throw new Error(`Invalid ${role} environment: production database connections must require TLS`);
  if (database.hostname.includes("-pooler.") && database.hostname.endsWith(".neon.tech")) throw new Error(`Invalid ${role} environment: direct database URL must not use the Neon pooled endpoint`);
}

const poolFields = {
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(5000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
  DATABASE_APPLICATION_NAME: z.string().min(1).max(80).optional(),
};

const liveR2Fields = {
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  R2_ENDPOINT: z.string().optional(),
  R2_BUCKET: z.string().min(3).max(63).optional(),
  R2_ACCESS_KEY_ID: z.string().min(8).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  R2_REGION: z.string().min(1).default("auto"),
  R2_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
};

const mediaBackupFields = {
  MEDIA_BACKUP_DRIVER: z.enum(["local", "r2"]).default("local"),
  MEDIA_BACKUP_R2_ENDPOINT: z.string().optional(),
  MEDIA_BACKUP_R2_BUCKET: z.string().min(3).max(63).optional(),
  MEDIA_BACKUP_R2_ACCESS_KEY_ID: z.string().min(8).optional(),
  MEDIA_BACKUP_R2_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  MEDIA_BACKUP_R2_REGION: z.string().min(1).default("auto"),
  MEDIA_BACKUP_R2_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
};

function validateLiveR2(role: ServiceRole, data: NodeJS.ProcessEnv, production: boolean) {
  if (data.STORAGE_DRIVER === "r2") {
    if (!data.R2_ENDPOINT || !data.R2_BUCKET || !data.R2_ACCESS_KEY_ID || !data.R2_SECRET_ACCESS_KEY || !validR2Endpoint(data.R2_ENDPOINT, production)) throw new Error(`Invalid ${role} environment: R2 configuration is incomplete or invalid`);
  }
  if (production && data.STORAGE_DRIVER !== "r2") throw new Error(`Invalid ${role} environment: production requires the R2 storage driver`);
  if (production && (data.R2_FORCE_PATH_STYLE === "true" || [data.R2_ACCESS_KEY_ID, data.R2_SECRET_ACCESS_KEY].some((value) => !value || PROVIDER_PLACEHOLDER.test(value)))) throw new Error(`Invalid ${role} environment: production R2 configuration is insecure`);
}

function validateMediaBackup(data: NodeJS.ProcessEnv, production: boolean) {
  if (data.MEDIA_BACKUP_DRIVER === "r2") {
    if (!data.MEDIA_BACKUP_R2_ENDPOINT || !data.MEDIA_BACKUP_R2_BUCKET || !data.MEDIA_BACKUP_R2_ACCESS_KEY_ID || !data.MEDIA_BACKUP_R2_SECRET_ACCESS_KEY || !validR2Endpoint(data.MEDIA_BACKUP_R2_ENDPOINT, production)) throw new Error("Invalid media-backup environment: backup R2 configuration is incomplete or invalid");
  }
  if (production && data.MEDIA_BACKUP_DRIVER !== "r2") throw new Error("Invalid media-backup environment: production requires the R2 backup driver");
  if (production && data.MEDIA_BACKUP_R2_FORCE_PATH_STYLE === "true") throw new Error("Invalid media-backup environment: path-style R2 access is not allowed");
}

export function trustedApplicationOrigins() {
  const values = [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL, ...(process.env.TRUSTED_APP_ORIGINS ?? "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(values.filter(validHttpOrigin))];
}

export function validateServiceEnvironment(role: ServiceRole, environment: NodeJS.ProcessEnv = process.env): ValidatedServiceEnvironment {
  const production = productionMode(environment);

  if (role === "migration") {
    rejectForbidden(role, environment, ["DATABASE_URL", "BETTER_AUTH_SECRET", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "BACKUP_ENCRYPTION_PASSPHRASE"], production);
    const data = parseEnvironment(role, z.object({ DIRECT_URL: z.string().url() }), environment);
    validateDirectDatabase(role, data.DIRECT_URL!, production);
    return data;
  }

  if (role === "database-backup") {
    rejectForbidden(role, environment, ["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"], production);
    const data = parseEnvironment(role, z.object({
      BACKUP_DATABASE_URL: z.string().url(),
      BACKUP_ENCRYPTION_PASSPHRASE: z.string().min(20),
      DATABASE_BACKUP_DRIVER: z.enum(["local", "r2"]).default("local"),
      DATABASE_BACKUP_ROOT: z.string().min(1).default(".data/database-backup-objects"),
      DATABASE_BACKUP_R2_ENDPOINT: z.string().optional(),
      DATABASE_BACKUP_R2_BUCKET: z.string().min(3).max(63).optional(),
      DATABASE_BACKUP_R2_ACCESS_KEY_ID: z.string().min(8).optional(),
      DATABASE_BACKUP_R2_SECRET_ACCESS_KEY: z.string().min(16).optional(),
      DATABASE_BACKUP_R2_REGION: z.string().min(1).default("auto"),
      DATABASE_BACKUP_R2_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
    }), environment);
    validateDirectDatabase(role, data.BACKUP_DATABASE_URL!, production);
    if (data.DATABASE_BACKUP_DRIVER === "r2" && (!data.DATABASE_BACKUP_R2_ENDPOINT || !data.DATABASE_BACKUP_R2_BUCKET || !data.DATABASE_BACKUP_R2_ACCESS_KEY_ID || !data.DATABASE_BACKUP_R2_SECRET_ACCESS_KEY || !validR2Endpoint(data.DATABASE_BACKUP_R2_ENDPOINT, production))) throw new Error("Invalid database-backup environment: backup R2 configuration is incomplete or invalid");
    if (production && data.DATABASE_BACKUP_DRIVER !== "r2") throw new Error("Invalid database-backup environment: production requires a durable R2 backup destination");
    if (production && data.DATABASE_BACKUP_R2_FORCE_PATH_STYLE === "true") throw new Error("Invalid database-backup environment: path-style R2 access is not allowed");
    return data;
  }

  const databaseOnlySchema = z.object({ DATABASE_URL: z.string().url(), ...poolFields });
  if (role === "email-maintenance" || role === "rate-limit-maintenance") {
    rejectForbidden(role, environment, ["DIRECT_URL", "BETTER_AUTH_SECRET", "R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "BACKUP_ENCRYPTION_PASSPHRASE"], production);
    const data = parseEnvironment(role, databaseOnlySchema, environment);
    validateRuntimeDatabase(role, data.DATABASE_URL!, production);
    return data;
  }

  if (role === "email-worker") {
    rejectForbidden(role, environment, ["DIRECT_URL", "BETTER_AUTH_SECRET", "R2_SECRET_ACCESS_KEY", "RESEND_WEBHOOK_SECRET", "ADMIN_NOTIFICATION_EMAIL", "BACKUP_ENCRYPTION_PASSPHRASE"], production);
    const data = parseEnvironment(role, z.object({
      DATABASE_URL: z.string().url(), ...poolFields,
      RATE_LIMIT_SECRET: z.string().min(32),
      EMAIL_DRIVER: z.enum(["development", "resend"]).default("development"),
      RESEND_API_KEY: z.string().min(20).optional(),
      RESEND_FROM: z.string().min(3).optional(),
      RESEND_SENDING_DOMAIN: z.string().min(3).optional(),
    }), environment);
    validateRuntimeDatabase(role, data.DATABASE_URL!, production);
    if (PLACEHOLDER.test(data.RATE_LIMIT_SECRET!)) throw new Error("Invalid email-worker environment: placeholder security secrets are not allowed");
    if (data.EMAIL_DRIVER === "resend") {
      if (!data.RESEND_API_KEY || !data.RESEND_FROM || !data.RESEND_SENDING_DOMAIN) throw new Error("Invalid email-worker environment: Resend configuration is incomplete");
      const fromDomain = senderAddress(data.RESEND_FROM)?.split("@")[1];
      if (!fromDomain || !(fromDomain === data.RESEND_SENDING_DOMAIN || fromDomain.endsWith(`.${data.RESEND_SENDING_DOMAIN}`))) throw new Error("Invalid email-worker environment: RESEND_FROM must use the configured sending domain");
    }
    if (production && (data.EMAIL_DRIVER !== "resend" || !data.RESEND_API_KEY || PROVIDER_PLACEHOLDER.test(data.RESEND_API_KEY))) throw new Error("Invalid email-worker environment: production Resend configuration is insecure");
    return data;
  }

  if (role === "media-maintenance" || role === "media-backup") {
    rejectForbidden(role, environment, ["DIRECT_URL", "BETTER_AUTH_SECRET", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "BACKUP_ENCRYPTION_PASSPHRASE"], production);
    const schema = z.object({ DATABASE_URL: z.string().url(), ...poolFields, ...liveR2Fields, ...(role === "media-backup" ? mediaBackupFields : {}) });
    const data = parseEnvironment(role, schema, environment);
    validateRuntimeDatabase(role, data.DATABASE_URL!, production);
    validateLiveR2(role, data, production);
    if (role === "media-backup") validateMediaBackup(data, production);
    return data;
  }

  rejectForbidden(role, environment, ["DIRECT_URL", "RESEND_API_KEY", "RESEND_FROM", "RESEND_SENDING_DOMAIN", "MEDIA_BACKUP_R2_SECRET_ACCESS_KEY", "DATABASE_BACKUP_R2_SECRET_ACCESS_KEY", "BACKUP_ENCRYPTION_PASSPHRASE"], production);
  const data = parseEnvironment(role, z.object({
    DATABASE_URL: z.string().url(), ...poolFields,
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().refine(validHttpOrigin, "must be an absolute HTTP(S) origin"),
    NEXT_PUBLIC_APP_URL: z.string().refine(validHttpOrigin, "must be an absolute HTTP(S) origin"),
    RATE_LIMIT_SECRET: z.string().min(32),
    TRUSTED_PROXY_MODE: z.enum(["none", "local", "railway"]).default("local"),
    APP_ENVIRONMENT: z.enum(["local", "staging", "production"]).optional(),
    STAGING_ACCESS_ENABLED: z.enum(["true", "false"]).optional(),
    STAGING_ACCESS_USERNAME: z.string().optional(),
    STAGING_ACCESS_PASSWORD: z.string().optional(),
    EMAIL_DRIVER: z.enum(["development", "resend"]).default("development"),
    RESEND_WEBHOOK_SECRET: z.string().min(20).optional(),
    ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
    TRUSTED_APP_ORIGINS: z.string().optional(),
    PUBLIC_SUBMISSIONS_ENABLED: z.enum(["true", "false"]).default("true"),
    RELEASE_SHA: z.string().max(128).optional(),
    ERROR_MONITORING_ENDPOINT: z.string().url().optional(),
    ERROR_MONITORING_TOKEN: z.string().min(20).optional(),
    ...liveR2Fields,
  }), environment);

  validateRuntimeDatabase(role, data.DATABASE_URL!, production);
  if (PLACEHOLDER.test(data.BETTER_AUTH_SECRET!) || PLACEHOLDER.test(data.RATE_LIMIT_SECRET!)) throw new Error("Invalid web environment: placeholder security secrets are not allowed");
  if (data.BETTER_AUTH_SECRET === data.RATE_LIMIT_SECRET) throw new Error("Invalid web environment: authentication and rate-limit secrets must be different");
  if (data.BETTER_AUTH_URL !== data.NEXT_PUBLIC_APP_URL) throw new Error("Invalid web environment: BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL must use the same canonical origin");
  const additionalOrigins = (data.TRUSTED_APP_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (additionalOrigins.some((origin) => !validHttpOrigin(origin))) throw new Error("Invalid web environment: every trusted origin must be an exact HTTP(S) origin");
  if (production) {
    if (data.APP_ENVIRONMENT !== "staging" && data.APP_ENVIRONMENT !== "production") throw new Error("Invalid web environment: APP_ENVIRONMENT must identify staging or production");
    if (new URL(data.NEXT_PUBLIC_APP_URL!).protocol !== "https:") throw new Error("Invalid web environment: the production application origin must use HTTPS");
    if (data.TRUSTED_PROXY_MODE !== "railway") throw new Error("Invalid web environment: production proxy trust must be explicitly configured for Railway");
    if (data.ERROR_MONITORING_ENDPOINT && new URL(data.ERROR_MONITORING_ENDPOINT).protocol !== "https:") throw new Error("Invalid web environment: production error monitoring must use HTTPS");
  }
  validateLiveR2(role, data, production);
  if (production && (data.EMAIL_DRIVER !== "resend" || !data.RESEND_WEBHOOK_SECRET || !data.ADMIN_NOTIFICATION_EMAIL || PROVIDER_PLACEHOLDER.test(data.RESEND_WEBHOOK_SECRET))) throw new Error("Invalid web environment: production webhook and notification configuration is incomplete");
  if (data.APP_ENVIRONMENT === "staging" && stagingGatewayConfiguration(data).state !== "enabled") throw new Error("Invalid web environment: staging access protection is incomplete");
  return data;
}

export function validateRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return validateServiceEnvironment("web", environment);
}
