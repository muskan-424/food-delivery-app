import userKycProfileModel from "../models/userKycProfileModel.js";
import { appConfig } from "../config/appConfig.js";

export async function getUserKycProfile(userId) {
  if (!userId) return null;
  return userKycProfileModel.findOne({ userId }).lean();
}

export async function userHasVerifiedKyc(userId) {
  if (!userId) return false;
  const row = await userKycProfileModel.findOne({ userId }).select("status").lean();
  return row?.status === "verified";
}

export async function assertKycForPayout(userId) {
  if (!appConfig.kycRequiredForPayout) return { ok: true };
  const verified = await userHasVerifiedKyc(userId);
  if (verified) return { ok: true };
  return { ok: false, message: "KYC verification required before payout registration" };
}

export function serializeKycProfile(profile) {
  if (!profile) {
    return { status: "none" };
  }
  const p = profile.toObject ? profile.toObject() : profile;
  return {
    userId: p.userId ? String(p.userId) : undefined,
    status: p.status || "pending",
    provider: p.provider || "",
    fullName: p.fullName || "",
    panMasked: p.panLast4 ? `XXXX${p.panLast4}` : "",
    aadhaarLast4: p.aadhaarLast4 || "",
    submittedAt: p.submittedAt || null,
    verifiedAt: p.verifiedAt || null,
    rejectedAt: p.rejectedAt || null,
    rejectionReason: p.rejectionReason || "",
    providerReferenceId: p.providerReferenceId || "",
  };
}
