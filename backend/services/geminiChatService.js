import { appConfig } from "../config/appConfig.js";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

/**
 * Optional Gemini polish for agent replies. Returns null when mock mode or no API key.
 */
export async function synthesizeAgentReply({
  intent,
  userMessage,
  factsBlock,
  language = "en",
}) {
  const key = String(process.env.GEMINI_API_KEY || "").trim();
  if (!key || appConfig.useMockAgent) return null;

  const prompt = [
    "You are Tomato food delivery assistant. Be concise and helpful.",
    `Intent: ${intent}`,
    `User language hint: ${language}`,
    `User message: ${userMessage}`,
    "Facts from tools (use only these, do not invent order IDs or prices):",
    factsBlock,
    "Reply in 2-5 sentences. If facts are insufficient, say so.",
  ].join("\n\n");

  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? String(text).trim() : null;
  } catch (err) {
    console.error("synthesizeAgentReply:", err?.message || err);
    return null;
  }
}
