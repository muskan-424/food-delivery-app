import notificationPreferenceModel, {
  NOTIFICATION_CATEGORIES,
} from "../models/notificationPreferenceModel.js";

const DEFAULT_CATEGORY_PREFS = {
  order_status: { inApp: true, email: true, sms: false, push: true },
  payment: { inApp: true, email: true, sms: false, push: true },
  promo: { inApp: true, email: false, sms: false, push: true },
  kyc: { inApp: true, email: true, sms: false, push: true },
  system: { inApp: true, email: true, sms: false, push: true },
};

export function mapNotificationTypeToCategory(type) {
  const t = String(type || "").toLowerCase();
  if (t === "order_status") return "order_status";
  if (t.includes("payment") || t.includes("refund")) return "payment";
  if (t.includes("promo") || t.includes("campaign") || t.includes("offer")) return "promo";
  if (t.includes("kyc")) return "kyc";
  return "system";
}

export async function getOrCreatePreferences(userId) {
  let row = await notificationPreferenceModel.findOne({ userId });
  if (!row) {
    row = await notificationPreferenceModel.create({
      userId,
      categories: DEFAULT_CATEGORY_PREFS,
    });
  }
  return row;
}

export async function updatePreferences(userId, categoriesPatch = {}) {
  const row = await getOrCreatePreferences(userId);
  for (const cat of NOTIFICATION_CATEGORIES) {
    if (!categoriesPatch[cat]) continue;
    const patch = categoriesPatch[cat];
    const current = row.categories?.[cat]?.toObject?.() || row.categories?.[cat] || {};
    row.categories[cat] = {
      inApp: patch.inApp !== undefined ? !!patch.inApp : current.inApp ?? true,
      email: patch.email !== undefined ? !!patch.email : current.email ?? true,
      sms: patch.sms !== undefined ? !!patch.sms : current.sms ?? false,
      push: patch.push !== undefined ? !!patch.push : current.push ?? true,
    };
  }
  await row.save();
  return row;
}

export async function isChannelEnabled(userId, { category, channel }) {
  const row = await getOrCreatePreferences(userId);
  const cat = NOTIFICATION_CATEGORIES.includes(category) ? category : "system";
  const prefs = row.categories?.[cat] || DEFAULT_CATEGORY_PREFS[cat];
  if (channel === "inApp") return prefs.inApp !== false;
  if (channel === "email") return prefs.email === true;
  if (channel === "sms") return prefs.sms === true;
  if (channel === "push") return prefs.push !== false;
  return true;
}
