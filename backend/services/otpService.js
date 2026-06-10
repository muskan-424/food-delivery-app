import crypto from "crypto";
import otpChallengeModel from "../models/otpChallengeModel.js";
import { appConfig } from "../config/appConfig.js";
import { sendVerificationOtpEmail } from "../utils/emailService.js";

function hashOtpCode(code) {
  const pepper = process.env.JWT_SECRET || "otp-pepper";
  return crypto.createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createAndSendEmailOtp({ userId, email, purpose }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!userId || !normalizedEmail || !purpose) {
    throw new Error("userId, email, and purpose are required");
  }

  const cooldownMs = appConfig.otpResendCooldownSeconds * 1000;
  const recent = await otpChallengeModel
    .findOne({
      userId,
      purpose,
      consumedAt: null,
      createdAt: { $gte: new Date(Date.now() - cooldownMs) },
    })
    .sort({ createdAt: -1 })
    .lean();

  if (recent) {
    const err = new Error("OTP recently sent. Please wait before requesting again.");
    err.code = "OTP_COOLDOWN";
    err.retryAfterSeconds = Math.ceil(
      (recent.createdAt.getTime() + cooldownMs - Date.now()) / 1000
    );
    throw err;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + appConfig.otpTtlSeconds * 1000);

  await otpChallengeModel.create({
    userId,
    email: normalizedEmail,
    purpose,
    codeHash: hashOtpCode(code),
    expiresAt,
  });

  const sent = await sendVerificationOtpEmail(normalizedEmail, code, purpose);
  if (!sent && appConfig.otpDevLogWhenNoSmtp && process.env.NODE_ENV !== "production") {
    console.warn(`[otp-dev] ${purpose} code for ${normalizedEmail}: ${code}`);
  }

  return { sent, expiresAt };
}

export async function verifyEmailOtp({ userId, email, purpose, code }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const trimmedCode = String(code || "").trim();
  if (!userId || !normalizedEmail || !purpose || !trimmedCode) {
    return { ok: false, reason: "invalid_input" };
  }

  const row = await otpChallengeModel
    .findOne({ userId, email: normalizedEmail, purpose, consumedAt: null })
    .sort({ createdAt: -1 });

  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt < new Date()) return { ok: false, reason: "expired" };
  if (row.attemptCount >= appConfig.otpMaxAttempts) {
    return { ok: false, reason: "max_attempts" };
  }

  row.attemptCount += 1;
  if (hashOtpCode(trimmedCode) !== row.codeHash) {
    await row.save();
    return { ok: false, reason: "invalid_code", attemptsLeft: appConfig.otpMaxAttempts - row.attemptCount };
  }

  row.consumedAt = new Date();
  await row.save();
  return { ok: true };
}
