export function normalizeUploadedMediaKey(raw) {
  const key = String(raw || "").trim();
  if (!key) return "";
  if (key.length > 512) return "";
  if (key.includes("..") || key.includes("\\") || key.startsWith("/")) return "";
  return key;
}

