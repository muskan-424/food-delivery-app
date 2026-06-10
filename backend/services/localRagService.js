import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tokenize(text) {
  return new Set(String(text || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}

function docPaths(projectRoot) {
  return [
    path.join(projectRoot, "docs", "tomato_help_faq.md"),
    path.join(projectRoot, "..", "README.md"),
  ];
}

export function loadMarkdownChunks(projectRoot) {
  const out = [];
  for (const filePath of docPaths(projectRoot)) {
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    const parts = text.split(/\n{2,}/);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned.length < 30) continue;
      out.push({
        source: path.basename(filePath),
        text: cleaned,
        score: 0,
      });
    }
  }
  return out;
}

let cachedChunks = null;

export function getLocalRagChunks() {
  if (!cachedChunks) {
    const projectRoot = path.join(__dirname, "..");
    cachedChunks = loadMarkdownChunks(projectRoot);
  }
  return cachedChunks;
}

export function retrieveLocalRag(query, topK = 3) {
  const qTokens = tokenize(query);
  if (!qTokens.size) return [];
  const chunks = getLocalRagChunks();
  const ranked = [];
  for (const chunk of chunks) {
    const cTokens = tokenize(chunk.text);
    let overlap = 0;
    for (const t of qTokens) {
      if (cTokens.has(t)) overlap += 1;
    }
    if (overlap === 0) continue;
    ranked.push({
      ...chunk,
      score: overlap / Math.max(qTokens.size, 1),
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, topK);
}

/** Test helper */
export function resetLocalRagCache() {
  cachedChunks = null;
}
