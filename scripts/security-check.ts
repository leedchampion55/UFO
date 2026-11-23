import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(Boolean);
const forbiddenPaths = [/(^|\/)\.env($|\.)/, /(^|\/)\.data\//, /(^|\/)uploads\//, /\.sqlite3?$/, /\.dump(?:\.enc)?$/, /(^|\/)dev-mail\//];
const badPaths = files.filter((file) => file !== ".env.example" && forbiddenPaths.some((pattern) => pattern.test(file)));
if (badPaths.length) throw new Error(`Sensitive runtime paths are tracked: ${badPaths.join(", ")}`);

let diff = "";
try { diff = execFileSync("git", ["grep", "-IEn", "(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|re_[A-Za-z0-9]{24,}|whsec_[A-Za-z0-9]{20,}|postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@)", "--", ":!package-lock.json", ":!.env.example"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
if (diff) throw new Error("A credential-like value was found in tracked source. Review locally before continuing.");
console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: "info", event: "repository.security_check_completed", trackedFiles: files.length }));
