import { appConfig } from "../config/appConfig.js";
import betaFeedbackModel, { BETA_FEEDBACK_CATEGORIES } from "../models/betaFeedbackModel.js";

export function getBetaFeatureFlags() {
  if (!appConfig.betaModeEnabled) {
    return {
      ai_assistant: true,
      order_chat: true,
      group_orders: true,
      voice_input: true,
      disputes: true,
      notifications: true,
    };
  }
  return {
    ai_assistant: appConfig.betaFeatureAiAssistant,
    order_chat: appConfig.betaFeatureOrderChat,
    group_orders: appConfig.betaFeatureGroupOrders,
    voice_input: appConfig.betaFeatureVoiceInput,
    disputes: true,
    notifications: true,
  };
}

export function getBetaConfigPayload() {
  return {
    beta_enabled: appConfig.betaModeEnabled,
    city_label: appConfig.betaCityLabel,
    pin_codes: appConfig.betaPinCodes,
    categories: appConfig.betaCategories,
    feature_flags: getBetaFeatureFlags(),
    feedback_path: "/feedback",
    feedback_categories: BETA_FEEDBACK_CATEGORIES,
  };
}

export function isPinAllowedForBeta(pincode) {
  if (!appConfig.betaModeEnabled) return true;
  const allowed = appConfig.betaPinCodes;
  if (!allowed.length) return true;
  const pin = String(pincode || "").trim();
  return allowed.includes(pin);
}

export async function submitBetaFeedback({
  userId,
  email,
  category,
  message,
  pagePath,
}) {
  const cat = BETA_FEEDBACK_CATEGORIES.includes(category) ? category : "other";
  const text = String(message || "").trim();
  if (text.length < 5) {
    return { ok: false, code: "MESSAGE_TOO_SHORT" };
  }
  if (text.length > 4000) {
    return { ok: false, code: "MESSAGE_TOO_LONG" };
  }
  const row = await betaFeedbackModel.create({
    userId: userId ? String(userId) : "",
    email: String(email || "").trim().slice(0, 200),
    category: cat,
    message: text,
    pagePath: String(pagePath || "").slice(0, 500),
  });
  return { ok: true, feedbackId: String(row._id) };
}
