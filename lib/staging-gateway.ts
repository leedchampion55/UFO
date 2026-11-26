import { createHash, timingSafeEqual } from "node:crypto";

export type StagingGatewayConfiguration =
  | { state: "disabled" }
  | { state: "invalid" }
  | { state: "enabled"; username: string; password: string };

function fixedLengthEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left, "utf8").digest();
  const rightHash = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftHash, rightHash);
}

export function stagingGatewayConfiguration(environment: NodeJS.ProcessEnv = process.env): StagingGatewayConfiguration {
  const staging = environment.APP_ENVIRONMENT === "staging";
  const explicitlyEnabled = environment.STAGING_ACCESS_ENABLED === "true";
  if (!staging && !explicitlyEnabled) return { state: "disabled" };
  if (!staging || !explicitlyEnabled) return { state: "invalid" };

  const username = environment.STAGING_ACCESS_USERNAME;
  const password = environment.STAGING_ACCESS_PASSWORD;
  if (!username || username.length < 3 || username.length > 64 || username.includes(":")) return { state: "invalid" };
  if (!password || password.length < 32 || password.length > 256) return { state: "invalid" };
  return { state: "enabled", username, password };
}

export function stagingGatewayAllowsRequest(authorization: string | null, configuration: StagingGatewayConfiguration) {
  if (configuration.state === "disabled") return true;
  if (configuration.state !== "enabled" || !authorization?.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return fixedLengthEqual(username, configuration.username) && fixedLengthEqual(password, configuration.password);
  } catch {
    return false;
  }
}

export function isStagingGatewayException(method: string, pathname: string) {
  return method === "GET" && (pathname === "/health/live" || pathname === "/health/ready")
    || method === "POST" && pathname === "/api/webhooks/resend";
}
