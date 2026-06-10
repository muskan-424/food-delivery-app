const CATEGORY_LABELS = {
  order_status: "Orders",
  payment: "Payments",
  promo: "Offers",
  kyc: "KYC",
  system: "System",
};

export function mapTypeToCategory(type) {
  const t = String(type || "").toLowerCase();
  if (t === "order_status") return "order_status";
  if (t.includes("payment") || t.includes("refund")) return "payment";
  if (t.includes("promo") || t.includes("offer")) return "promo";
  if (t.includes("kyc")) return "kyc";
  return "system";
}

export function normalizeNotification(raw) {
  if (!raw) return null;
  const id = raw._id || raw.id;
  if (!id) return null;
  const category = mapTypeToCategory(raw.type);
  return {
    id: String(id),
    title: raw.title || "Notification",
    body: raw.body || "",
    type: raw.type || "system",
    category,
    categoryLabel: CATEGORY_LABELS[category] || "System",
    read: !!raw.read,
    refType: raw.refType || "",
    refId: raw.refId || "",
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

export function formatNotificationTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function filterNotifications(items, tab) {
  if (tab === "all") return items;
  if (tab === "unread") return items.filter((n) => !n.read);
  return items.filter((n) => n.category === tab);
}

export const NOTIFICATION_TABS = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "order_status", label: "Orders" },
  { id: "payment", label: "Payments" },
  { id: "system", label: "System" },
];

export const PREF_CATEGORIES = [
  { id: "order_status", label: "Order updates" },
  { id: "payment", label: "Payments & refunds" },
  { id: "promo", label: "Offers & promos" },
  { id: "kyc", label: "KYC & verification" },
  { id: "system", label: "System alerts" },
];

export const PREF_CHANNELS = [
  { id: "inApp", label: "In-app" },
  { id: "email", label: "Email" },
  { id: "push", label: "Push" },
];
