import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { appConfig } from "../config/appConfig.js";

let s3Client = null;

function getS3Client() {
  if (s3Client) return s3Client;
  if (appConfig.objectStorageProvider !== "s3") return null;
  const endpoint = appConfig.objectStorageS3Endpoint;
  s3Client = new S3Client({
    region: appConfig.objectStorageS3Region,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: appConfig.objectStorageS3ForcePathStyle,
  });
  return s3Client;
}

export function getMediaPublicUrl(key) {
  const clean = String(key || "").trim();
  if (!clean) return null;
  if (appConfig.objectStorageProvider === "s3") {
    const base = appConfig.objectStoragePublicBaseUrl;
    if (base) {
      return `${base.replace(/\/+$/, "")}/${encodeURIComponent(clean)}`;
    }
    const endpoint = appConfig.objectStorageS3Endpoint;
    const bucket = appConfig.objectStorageS3Bucket;
    if (endpoint && bucket) {
      return `${endpoint.replace(/\/+$/, "")}/${bucket}/${encodeURIComponent(clean)}`;
    }
  }
  return `/images/${clean}`;
}

export async function createSignedGetUrl(key, ttlSec = appConfig.objectStorageSignedUrlTtlSec) {
  const clean = String(key || "").trim();
  if (!clean) return null;
  if (appConfig.objectStorageProvider !== "s3") return getMediaPublicUrl(clean);
  const client = getS3Client();
  const bucket = appConfig.objectStorageS3Bucket;
  if (!client || !bucket) return getMediaPublicUrl(clean);
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: clean });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}

export async function createSignedPutUrl({
  key,
  contentType = "application/octet-stream",
  ttlSec = appConfig.objectStorageSignedUrlTtlSec,
}) {
  const clean = String(key || "").trim();
  if (!clean) return null;
  if (appConfig.objectStorageProvider !== "s3") return null;
  const client = getS3Client();
  const bucket = appConfig.objectStorageS3Bucket;
  if (!client || !bucket) return null;
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: clean, ContentType: contentType });
  return getSignedUrl(client, cmd, { expiresIn: ttlSec });
}

export function getObjectStorageStats() {
  return {
    provider: appConfig.objectStorageProvider,
    bucket: appConfig.objectStorageS3Bucket || null,
    endpoint: appConfig.objectStorageS3Endpoint || null,
    publicBaseUrl: appConfig.objectStoragePublicBaseUrl || null,
    signedUrlTtlSec: appConfig.objectStorageSignedUrlTtlSec,
  };
}

