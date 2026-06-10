import { appConfig } from "../config/appConfig.js";
import { retrieveLocalRag } from "./localRagService.js";

/**
 * Local token-overlap RAG; optional Pinecone when PINECONE_API_KEY + index configured (stub).
 */
export function retrieveHybridRag(query, topK = 3) {
  const local = retrieveLocalRag(query, topK);
  if (local.length > 0) {
    return { chunks: local, provider: "local" };
  }

  const pineconeKey = String(process.env.PINECONE_API_KEY || "").trim();
  const pineconeIndex = String(process.env.PINECONE_INDEX || "").trim();
  if (pineconeKey && pineconeIndex && appConfig.enablePineconeRag) {
    return { chunks: [], provider: "pinecone_unconfigured_runtime" };
  }

  return { chunks: [], provider: "none" };
}
