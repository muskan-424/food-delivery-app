const ORDER_PATTERNS = [
  /where\s+is\s+my\s+order/i,
  /order\s+status/i,
  /track\s+my\s+order/i,
  /mera\s+order/i,
  /delivery\s+status/i,
];

const SEARCH_PATTERNS = [
  /search\s+for/i,
  /find\s+(pizza|biryani|burger|food|restaurant)/i,
  /show\s+me\s+/i,
  /khana\s+dikhao/i,
  /restaurant\s+near/i,
];

const CART_PATTERNS = [
  /my\s+cart/i,
  /cart\s+items/i,
  /checkout/i,
  /what\s+is\s+in\s+my\s+cart/i,
];

const APP_HELP_PATTERNS = [
  /what\s+(does|is)\s+this\s+app/i,
  /how\s+do\s+i\s+(pay|cancel|track)/i,
  /help\s+me/i,
  /faq/i,
];

export const AGENT_INTENTS = [
  "order_status",
  "food_search",
  "cart_hints",
  "app_help",
  "general_help",
];

export function classifyAgentIntent(message) {
  const m = String(message || "").trim();
  const lower = m.toLowerCase();
  if (!m) return { intent: "general_help", confidence: 0.2 };

  for (const rx of ORDER_PATTERNS) {
    if (rx.test(m)) return { intent: "order_status", confidence: 0.88 };
  }
  if (/\b(order|ord)\s*#?\s*[a-z0-9]{4,}/i.test(m)) {
    return { intent: "order_status", confidence: 0.82 };
  }

  for (const rx of SEARCH_PATTERNS) {
    if (rx.test(m)) return { intent: "food_search", confidence: 0.8 };
  }
  if (lower.includes("pizza") || lower.includes("biryani") || lower.includes("restaurant")) {
    return { intent: "food_search", confidence: 0.65 };
  }

  for (const rx of CART_PATTERNS) {
    if (rx.test(m)) return { intent: "cart_hints", confidence: 0.78 };
  }

  for (const rx of APP_HELP_PATTERNS) {
    if (rx.test(m)) return { intent: "app_help", confidence: 0.75 };
  }

  return { intent: "general_help", confidence: 0.45 };
}

export function confidenceFromToolTrace(tools = []) {
  if (!tools.length) return 0.4;
  const ok = tools.filter((t) => t.ok).length;
  const ratio = ok / tools.length;
  const maxToolConf = Math.max(...tools.map((t) => Number(t.confidence || 0)), 0);
  return Math.min(0.95, ratio * 0.5 + maxToolConf * 0.5);
}
