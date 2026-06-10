import { appConfig } from "../config/appConfig.js";

const REQUIRED_KEYS = ["title", "description"];

export function buildOrderRequestSchemaFromRules(text) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();

  let eventType = "custom";
  if (/cater|party|birthday|wedding|corporate|office lunch|function/.test(low)) {
    eventType = "catering";
  }

  const guestMatch = t.match(/(\d{1,4})\s*(people|guests|persons|log|लोग)/i);
  const guestCount = guestMatch ? Number(guestMatch[1]) : null;

  const nums = [...t.matchAll(/\b(\d{3,6})\b/g)].map((m) => Number(m[1]));
  let budgetMin = 2000;
  let budgetMax = 8000;
  if (nums.length >= 2) {
    const [a, b] = nums.slice(0, 2).sort((x, y) => x - y);
    budgetMin = a;
    budgetMax = b;
  } else if (nums.length === 1) {
    budgetMin = Math.max(500, nums[0] - 500);
    budgetMax = nums[0] + 500;
  }

  const dietary = {
    vegetarian: /veg(?!an)|shakahari|शाकाहारी|jain/.test(low),
    vegan: /vegan/.test(low),
    halal: /halal/.test(low),
    allergies: [],
  };
  const allergyMatch = t.match(/allerg(?:y|ies)[:\s]+([^.;\n]+)/i);
  if (allergyMatch) {
    dietary.allergies = allergyMatch[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  const items = [];
  const foodKeywords = [
    "biryani",
    "pizza",
    "burger",
    "thali",
    "snacks",
    "dessert",
    "cake",
    "paneer",
    "chicken",
    "naan",
    "rolls",
    "samosa",
  ];
  for (const kw of foodKeywords) {
    if (low.includes(kw)) {
      items.push({ name: kw.charAt(0).toUpperCase() + kw.slice(1), quantity: guestCount || 1, notes: "" });
    }
  }
  if (!items.length && eventType === "catering") {
    items.push({ name: "Mixed catering menu", quantity: guestCount || 1, notes: "To be confirmed with restaurant" });
  }

  let deliveryDate = "";
  let startTime = "";
  const dateMatch = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) deliveryDate = dateMatch[1];
  const timeMatch = t.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (timeMatch) startTime = timeMatch[1];

  const nonAscii = [...t.slice(0, 300)].filter((c) => c.charCodeAt(0) > 127).length;
  const language = nonAscii > 5 ? "hi" : "en";

  const title =
    eventType === "catering"
      ? `Catering request${guestCount ? ` for ${guestCount} guests` : ""}`
      : t.slice(0, 100);

  return {
    title: title.trim(),
    description: t,
    language,
    eventType,
    guestCount,
    items,
    dietary,
    budget: { min: budgetMin, max: budgetMax, currency: "INR" },
    deliveryWindow: {
      date: deliveryDate,
      startTime,
      endTime: "",
      label: deliveryDate ? `Delivery on ${deliveryDate}` : "",
    },
  };
}

export function normalizeOrderRequestSchema(raw, sourceText) {
  const src = String(sourceText || "");
  const budget = raw?.budget && typeof raw.budget === "object" ? raw.budget : {};
  let minB = Number(budget.min);
  let maxB = Number(budget.max);
  if (!Number.isFinite(minB)) minB = 2000;
  if (!Number.isFinite(maxB)) maxB = 8000;
  if (minB > maxB) [minB, maxB] = [maxB, minB];

  const items = Array.isArray(raw?.items)
    ? raw.items
        .filter((x) => x && String(x.name || "").trim())
        .map((x) => ({
          name: String(x.name).trim().slice(0, 120),
          quantity: Math.max(1, Number(x.quantity) || 1),
          notes: String(x.notes || "").slice(0, 300),
        }))
        .slice(0, 30)
    : [];

  const dietary = raw?.dietary && typeof raw.dietary === "object" ? raw.dietary : {};
  const dw = raw?.deliveryWindow && typeof raw.deliveryWindow === "object" ? raw.deliveryWindow : {};

  return {
    title: String(raw?.title || src.slice(0, 120)).trim(),
    description: String(raw?.description || src).trim(),
    language: String(raw?.language || "en").slice(0, 10),
    eventType: String(raw?.eventType || "custom").slice(0, 40),
    guestCount: Number.isFinite(Number(raw?.guestCount)) ? Number(raw.guestCount) : null,
    items,
    dietary: {
      vegetarian: !!dietary.vegetarian,
      vegan: !!dietary.vegan,
      halal: !!dietary.halal,
      allergies: Array.isArray(dietary.allergies)
        ? dietary.allergies.map((a) => String(a).slice(0, 80)).slice(0, 8)
        : [],
    },
    budget: { min: minB, max: maxB, currency: "INR" },
    deliveryWindow: {
      date: String(dw.date || "").slice(0, 10),
      startTime: String(dw.startTime || "").slice(0, 20),
      endTime: String(dw.endTime || "").slice(0, 20),
      label: String(dw.label || "").slice(0, 120),
    },
  };
}

export function validateOrderRequestSchema(schema) {
  const errors = [];
  if (!schema || typeof schema !== "object") {
    return { valid: false, errors: ["schema must be a JSON object"] };
  }
  for (const key of REQUIRED_KEYS) {
    if (!String(schema[key] || "").trim()) errors.push(`missing or empty ${key}`);
  }
  const b = schema.budget;
  if (!b || typeof b !== "object") {
    errors.push("budget must be an object");
  } else if (Number(b.min) <= 0 || Number(b.max) <= 0 || Number(b.min) > Number(b.max)) {
    errors.push("budget min/max invalid");
  }
  return { valid: errors.length === 0, errors };
}

async function buildOrderRequestSchemaWithGemini(text) {
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key || appConfig.useMockAgent) return null;

  const prompt = `Extract a food catering / custom order request as JSON for India.
Fields: title, description, language, eventType, guestCount, items[{name,quantity,notes}],
dietary{vegetarian,vegan,halal,allergies[]}, budget{min,max,currency}, deliveryWindow{date,startTime,endTime,label}.
User message:
${text}`;

  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    const normalized = normalizeOrderRequestSchema(parsed, text);
    const { valid } = validateOrderRequestSchema(normalized);
    return valid ? normalized : null;
  } catch (err) {
    console.error("buildOrderRequestSchemaWithGemini:", err?.message || err);
    return null;
  }
}

export async function resolveOrderRequestSchema(text, language) {
  let schema = await buildOrderRequestSchemaWithGemini(text);
  let provider = "gemini";
  if (!schema) {
    schema = normalizeOrderRequestSchema(buildOrderRequestSchemaFromRules(text), text);
    provider = "rule";
  }
  if (language) schema.language = String(language).slice(0, 10);
  const validation = validateOrderRequestSchema(schema);
  return { schema, provider, validation };
}
