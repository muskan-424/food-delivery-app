import userKycProfileModel from "../models/userKycProfileModel.js";
import { getKycProvider } from "./kycProviders/index.js";
import { isValidPan, normalizePan, panLast4 } from "../utils/panValidation.js";
import { serializeKycProfile } from "../utils/userKycUtils.js";

const MAX_HISTORY = 30;

function pushHistory(profile, entry) {
  const history = Array.isArray(profile.history) ? [...profile.history] : [];
  history.push(entry);
  profile.history = history.slice(-MAX_HISTORY);
}

export async function getKycProfileForUser(userId) {
  return userKycProfileModel.findOne({ userId });
}

export async function submitUserKyc({ userId, fullName, pan, aadhaarLast4 }) {
  const normalizedPan = normalizePan(pan);
  if (!isValidPan(normalizedPan)) {
    const err = new Error("invalid_pan");
    throw err;
  }

  const existing = await userKycProfileModel.findOne({ userId });
  if (existing?.status === "verified") {
    const err = new Error("already_verified");
    throw err;
  }

  const now = new Date();
  const provider = getKycProvider();
  const last4 = panLast4(normalizedPan);
  const aadhaar = aadhaarLast4 ? String(aadhaarLast4).replace(/\D/g, "").slice(-4) : "";

  let profile;
  if (existing) {
    profile = existing;
    profile.fullName = String(fullName || "").trim().slice(0, 120);
    profile.panLast4 = last4;
    profile.aadhaarLast4 = aadhaar;
    profile.submittedAt = now;
    profile.rejectionReason = "";
    profile.rejectedAt = null;
    profile.verifiedAt = null;
  } else {
    profile = new userKycProfileModel({
      userId,
      fullName: String(fullName || "").trim().slice(0, 120),
      panLast4: last4,
      aadhaarLast4: aadhaar,
      submittedAt: now,
      status: "pending",
    });
  }

  const fromStatus = existing?.status || "none";
  provider.assignReferenceAndStatus(profile);
  pushHistory(profile, {
    fromStatus,
    toStatus: profile.status,
    note: "submitted",
    actorId: String(userId),
    changedAt: now,
  });

  await profile.save();
  return profile;
}

export async function adminReviewUserKyc({ userId, approve, reason, actorId }) {
  const profile = await userKycProfileModel.findOne({ userId });
  if (!profile) {
    const err = new Error("not_found");
    throw err;
  }
  if (profile.status !== "pending") {
    const err = new Error("not_pending");
    throw err;
  }

  const now = new Date();
  const fromStatus = profile.status;
  if (approve) {
    profile.status = "verified";
    profile.verifiedAt = now;
    profile.rejectedAt = null;
    profile.rejectionReason = "";
  } else {
    profile.status = "rejected";
    profile.rejectedAt = now;
    profile.rejectionReason = String(reason || "").trim().slice(0, 500);
    profile.verifiedAt = null;
  }

  pushHistory(profile, {
    fromStatus,
    toStatus: profile.status,
    note: approve ? "admin_approved" : "admin_rejected",
    actorId: String(actorId || ""),
    changedAt: now,
  });

  await profile.save();
  return profile;
}

export async function applyKycProviderWebhook(payload) {
  const ref = String(
    payload?.provider_reference_id || payload?.providerReferenceId || payload?.reference_id || ""
  ).trim();
  if (!ref) return { result: "ignored", reason: "missing provider_reference_id" };

  const raw = String(payload?.status || "").trim().toLowerCase();
  if (!["verified", "rejected", "failed"].includes(raw)) {
    return { result: "ignored", reason: "unsupported status" };
  }

  const profile = await userKycProfileModel.findOne({ providerReferenceId: ref });
  if (!profile) {
    return { result: "ok", note: "no matching profile" };
  }

  const now = new Date();
  const fromStatus = profile.status;
  const reason = String(payload?.reason || payload?.rejection_reason || "").trim().slice(0, 500);

  if (raw === "verified") {
    profile.status = "verified";
    profile.verifiedAt = now;
    profile.rejectedAt = null;
    profile.rejectionReason = "";
  } else {
    profile.status = "rejected";
    profile.rejectedAt = now;
    profile.rejectionReason = reason || "Provider rejected";
    profile.verifiedAt = null;
  }

  profile.metadata = {
    ...(profile.metadata || {}),
    lastWebhook: { status: raw, at: now.toISOString() },
  };

  pushHistory(profile, {
    fromStatus,
    toStatus: profile.status,
    note: `webhook_${raw}`,
    actorId: "kyc_provider",
    changedAt: now,
  });

  await profile.save();
  return { result: "ok", userId: String(profile.userId) };
}

export async function listPendingKyc({ page = 1, limit = 20 } = {}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;
  const filter = { status: "pending" };

  const [rows, total] = await Promise.all([
    userKycProfileModel.find(filter).sort({ submittedAt: 1 }).skip(skip).limit(safeLimit).lean(),
    userKycProfileModel.countDocuments(filter),
  ]);

  return {
    rows: rows.map((r) => serializeKycProfile(r)),
    total,
    page: safePage,
    limit: safeLimit,
  };
}

export async function getKycMetricsSummary() {
  const grouped = await userKycProfileModel.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const byStatus = { pending: 0, verified: 0, rejected: 0 };
  for (const g of grouped) {
    if (g._id && byStatus[g._id] !== undefined) byStatus[g._id] = g.count;
  }
  return {
    total: byStatus.pending + byStatus.verified + byStatus.rejected,
    byStatus,
    generatedAt: new Date().toISOString(),
  };
}
