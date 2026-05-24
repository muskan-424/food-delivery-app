import crypto from "crypto";
import abExperimentModel from "../models/abExperimentModel.js";
import { getRedisClient } from "../config/redis.js";

function stablePercent(seed) {
  const hex = crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 12);
  const n = parseInt(hex, 16);
  return n / 0xffffffffffff;
}

function normalizeTags(tags) {
  return Array.from(
    new Set((Array.isArray(tags) ? tags : []).map((t) => String(t || "").trim().toLowerCase()).filter(Boolean))
  );
}

export function normalizeExperimentVariants(variants = []) {
  const rows = (Array.isArray(variants) ? variants : [])
    .map((v) => ({
      key: String(v?.key || "").trim().toLowerCase(),
      label: String(v?.label || "").trim(),
      weight: Number(v?.weight),
    }))
    .filter((v) => v.key && Number.isFinite(v.weight) && v.weight > 0);
  if (rows.length < 2) return [];
  return rows;
}

export function isExperimentActive(experiment, now = new Date()) {
  if (!experiment || experiment.status !== "active") return false;
  if (experiment.startAt && now < new Date(experiment.startAt)) return false;
  if (experiment.endAt && now > new Date(experiment.endAt)) return false;
  return true;
}

function isAudienceMatch(experiment, userTags = []) {
  const audienceTags = normalizeTags(experiment?.audienceTags || []);
  if (!audienceTags.length) return true;
  const tags = normalizeTags(userTags);
  if (!tags.length) return false;
  if (experiment?.audienceMode === "all") {
    return audienceTags.every((t) => tags.includes(t));
  }
  return audienceTags.some((t) => tags.includes(t));
}

function weightedPick(variants = [], percent = 0) {
  const total = variants.reduce((sum, v) => sum + Number(v.weight || 0), 0);
  if (!Number.isFinite(total) || total <= 0) return variants[0]?.key || "";
  let cursor = 0;
  for (const v of variants) {
    cursor += Number(v.weight || 0) / total;
    if (percent <= cursor) return v.key;
  }
  return variants[variants.length - 1]?.key || "";
}

export async function assignExperimentForUser({ experimentKey, userId, userTags = [] }) {
  const key = String(experimentKey || "").trim().toLowerCase();
  const uid = String(userId || "").trim();
  if (!key || !uid) return { ok: false, code: "invalid_input" };
  const experiment = await abExperimentModel.findOne({ key }).lean();
  if (!experiment) return { ok: false, code: "not_found" };
  if (!isExperimentActive(experiment)) return { ok: false, code: "not_active" };
  if (!isAudienceMatch(experiment, userTags)) return { ok: false, code: "not_in_audience" };

  const redis = getRedisClient();
  const assignmentKey = `ab:assign:${key}:${uid}`;
  let variant = "";
  let source = "computed";
  if (redis) {
    try {
      const existing = await redis.get(assignmentKey);
      if (existing) {
        variant = String(existing);
        source = "sticky";
      }
    } catch {}
  }
  if (!variant) {
    variant = weightedPick(experiment.variants || [], stablePercent(`${key}:${uid}`));
    if (redis && variant) {
      try {
        await redis.set(assignmentKey, variant, "EX", 60 * 60 * 24 * 30);
        await redis.hincrby(`ab:counts:${key}`, variant, 1);
      } catch {}
    }
  }
  return {
    ok: true,
    data: {
      experimentKey: key,
      variant,
      source,
      status: experiment.status,
      evaluatedAt: new Date().toISOString(),
    },
  };
}

export async function getExperimentAssignmentCounts(experimentKey) {
  const key = String(experimentKey || "").trim().toLowerCase();
  const redis = getRedisClient();
  if (!redis || !key) return {};
  try {
    const rows = await redis.hgetall(`ab:counts:${key}`);
    const out = {};
    for (const [k, v] of Object.entries(rows || {})) {
      out[k] = Number(v) || 0;
    }
    return out;
  } catch {
    return {};
  }
}
