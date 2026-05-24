import crypto from "crypto";
import userModel from "../models/userModel.js";

const CODE_LEN = 8;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Ensure user has a unique referralCode (idempotent).
 */
export async function ensureReferralCodeForUser(userDoc) {
  if (userDoc.referralCode) {
    return userDoc;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    userDoc.referralCode = randomCode();
    try {
      await userDoc.save();
      return userDoc;
    } catch (err) {
      if (err?.code === 11000) {
        userDoc.referralCode = "";
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not generate referral code");
}

export async function findReferrerByCode(rawCode) {
  if (!rawCode || typeof rawCode !== "string") return null;
  const code = rawCode.trim().toUpperCase();
  if (code.length < 4) return null;
  return userModel.findOne({ referralCode: code });
}
