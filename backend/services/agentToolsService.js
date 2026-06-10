import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import foodModel from "../models/foodModel.js";
import restaurantModel from "../models/restaurantModel.js";
import { retrieveHybridRag } from "./hybridRagService.js";

function escRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function toolOrderStatus(userId, message) {
  const m = String(message || "");
  const orderNoMatch = m.match(/\b(ORD[A-Z0-9]+|DSP[A-Z0-9]+|\d{6,})\b/i);
  const filter = { userId: String(userId) };
  if (orderNoMatch) {
    filter.orderNumber = new RegExp(escRe(orderNoMatch[1]), "i");
  }

  const orders = await orderModel
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(orderNoMatch ? 1 : 3)
    .select("orderNumber status finalAmount createdAt deliveredAt payment.status")
    .lean();

  if (!orders.length) {
    return {
      ok: false,
      confidence: 0.35,
      data: { orders: [] },
      summary: "I could not find any recent orders on your account.",
    };
  }

  const lines = orders.map(
    (o) =>
      `Order ${o.orderNumber}: status **${o.status}**` +
      (o.payment?.status ? `, payment ${o.payment.status}` : "") +
      (o.deliveredAt ? `, delivered ${new Date(o.deliveredAt).toLocaleString()}` : "")
  );

  return {
    ok: true,
    confidence: orderNoMatch ? 0.9 : 0.82,
    data: { orders },
    summary: lines.join("\n"),
  };
}

export async function toolFoodSearch(message, limit = 5) {
  const q = String(message || "")
    .replace(/search\s+for|find|show\s+me/gi, "")
    .trim()
    .slice(0, 80);
  if (q.length < 2) {
    return {
      ok: false,
      confidence: 0.3,
      data: { foods: [], restaurants: [] },
      summary: "Tell me what food or restaurant you are looking for.",
    };
  }

  const rx = { $regex: escRe(q), $options: "i" };
  const [foods, restaurants] = await Promise.all([
    foodModel
      .find({ isAvailable: true, $or: [{ name: rx }, { category: rx }, { description: rx }] })
      .limit(limit)
      .select("name category price image restaurantId")
      .lean(),
    restaurantModel
      .find({
        isActive: true,
        $or: [{ name: rx }, { cuisine: rx }, { description: rx }],
      })
      .limit(limit)
      .select("name cuisine rating image")
      .lean(),
  ]);

  const foodLines = foods.map((f) => `• ${f.name} (${f.category}) — ₹${f.price}`);
  const restLines = restaurants.map((r) => `• ${r.name} (${r.cuisine || "multi"})`);
  const summary = [
    foodLines.length ? `Food matches:\n${foodLines.join("\n")}` : "",
    restLines.length ? `Restaurants:\n${restLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    ok: foods.length + restaurants.length > 0,
    confidence: foods.length + restaurants.length > 0 ? 0.72 : 0.4,
    data: { foods, restaurants, query: q },
    summary: summary || `No matches for "${q}". Try another dish or restaurant name.`,
  };
}

export async function toolCartHints(userId) {
  const user = await userModel.findById(userId).select("cartData").lean();
  const cart = user?.cartData && typeof user.cartData === "object" ? user.cartData : {};
  const keys = Object.keys(cart);
  if (!keys.length) {
    return {
      ok: true,
      confidence: 0.7,
      data: { itemCount: 0, restaurants: [] },
      summary: "Your cart is empty. Browse restaurants and add items to checkout.",
    };
  }

  let itemCount = 0;
  const restaurants = [];
  for (const key of keys) {
    const bucket = cart[key];
    const items = Array.isArray(bucket?.items) ? bucket.items : [];
    itemCount += items.length;
    if (bucket?.restaurantName || key) {
      restaurants.push(String(bucket?.restaurantName || key));
    }
  }

  return {
    ok: true,
    confidence: 0.78,
    data: { itemCount, restaurants: [...new Set(restaurants)] },
    summary: `Your cart has ${itemCount} item(s) across ${restaurants.length || 1} restaurant slot(s). Open cart to review and checkout.`,
  };
}

export function toolFaqRag(message) {
  const { chunks, provider } = retrieveHybridRag(message, 3);
  if (!chunks.length) {
    return {
      ok: false,
      confidence: 0.35,
      data: { sources: [], provider },
      summary: "I do not have a specific FAQ match. Contact support for more help.",
    };
  }

  const summary = chunks.map((c) => c.text.slice(0, 280)).join("\n\n—\n\n");
  return {
    ok: true,
    confidence: Math.min(0.8, 0.45 + chunks[0].score * 0.4),
    data: {
      provider,
      sources: chunks.map((c) => ({ source: c.source, score: c.score, excerpt: c.text.slice(0, 200) })),
    },
    summary,
  };
}

export async function runAgentTools({ intent, userId, message }) {
  const tools = [];
  if (intent === "order_status") {
    const t = await toolOrderStatus(userId, message);
    tools.push({ name: "order_status", ...t });
  } else if (intent === "food_search") {
    const t = await toolFoodSearch(message);
    tools.push({ name: "food_search", ...t });
  } else if (intent === "cart_hints") {
    const t = await toolCartHints(userId);
    tools.push({ name: "cart_hints", ...t });
  } else {
    const t = toolFaqRag(message);
    tools.push({ name: "faq_rag", ...t });
  }

  if (intent === "app_help" || intent === "general_help") {
    const rag = toolFaqRag(message);
    if (!tools.some((x) => x.name === "faq_rag")) {
      tools.push({ name: "faq_rag", ...rag });
    }
  }

  return tools;
}
