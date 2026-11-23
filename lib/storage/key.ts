export function assertStorageKey(key: string) {
  if (!key || key.startsWith("/") || key.includes("\\") || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("INVALID_STORAGE_KEY");
  return key;
}
