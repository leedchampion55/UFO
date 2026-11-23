import { randomUUID } from "node:crypto";

type LogLevel = "debug" | "info" | "warn" | "error";
type SafeValue = string | number | boolean | null | undefined;

const safeField = /^[a-z][a-zA-Z0-9]{0,48}$/;

export function releaseIdentifier(environment: NodeJS.ProcessEnv = process.env) {
  return environment.RELEASE_SHA ?? environment.RAILWAY_GIT_COMMIT_SHA ?? environment.RAILWAY_DEPLOYMENT_ID ?? "local";
}

export function correlationId(headers?: Headers) {
  const supplied = headers?.get("x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

export function operationalLog(level: LogLevel, event: string, fields: Record<string, SafeValue> = {}) {
  const safe: Record<string, SafeValue> = {};
  for (const [key, value] of Object.entries(fields)) if (safeField.test(key) && (value == null || ["string", "number", "boolean"].includes(typeof value))) safe[key] = typeof value === "string" ? value.slice(0, 200) : value;
  const record = { timestamp: new Date().toISOString(), level, event: event.slice(0, 120), release: releaseIdentifier(), ...safe };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
}
