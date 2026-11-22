const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

/**
 * Accept only an application-relative path. The returned value is safe to pass
 * to Next.js redirect/router APIs and can never resolve to another origin.
 */
export function safeInternalPath(value: unknown, fallback = "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || CONTROL_CHARACTERS.test(value) || ENCODED_PATH_SEPARATOR.test(value)) return fallback;

  try {
    const parsed = new URL(value, "https://internal.invalid");
    if (parsed.origin !== "https://internal.invalid" || parsed.username || parsed.password) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function appendInternalQuery(value: unknown, key: string, content: string, fallback = "/") {
  const safe = safeInternalPath(value, fallback);
  const parsed = new URL(safe, "https://internal.invalid");
  parsed.searchParams.set(key, content);
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
