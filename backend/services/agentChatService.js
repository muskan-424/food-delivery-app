import agentChatSessionModel from "../models/agentChatSessionModel.js";
import agentChatMessageModel from "../models/agentChatMessageModel.js";
import { appConfig } from "../config/appConfig.js";
import {
  classifyAgentIntent,
  confidenceFromToolTrace,
} from "./agentIntentService.js";
import { runAgentTools } from "./agentToolsService.js";
import { synthesizeAgentReply } from "./geminiChatService.js";

const LOW_CONF_NOTE =
  "\n\n— Note: confidence is low for this reply; please verify important details in the app.";

function appendLowConfidenceNote(text, confidence) {
  if (confidence >= appConfig.agentConfidenceThreshold) return text;
  if (!appConfig.lowConfidenceAppendNote) return text;
  if (String(text).toLowerCase().includes("confidence is low")) return text;
  return `${text}${LOW_CONF_NOTE}`;
}

function composeRuleReply(intent, tools) {
  const parts = tools.map((t) => t.summary).filter(Boolean);
  if (parts.length) return parts.join("\n\n");
  if (intent === "order_status") {
    return "Tell me your order number or ask 'where is my order' and I will look it up.";
  }
  return "How can I help with your food order today?";
}

export async function ensureAgentSession(userId, sessionId, language) {
  if (sessionId) {
    const existing = await agentChatSessionModel.findOne({
      _id: sessionId,
      userId,
      status: "active",
    });
    if (existing) return existing;
  }
  return agentChatSessionModel.create({
    userId,
    language: language || "en",
    status: "active",
  });
}

export async function listAgentChatHistory(sessionId, userId, { limit = 50 } = {}) {
  const session = await agentChatSessionModel.findOne({ _id: sessionId, userId });
  if (!session) return { ok: false, code: "SESSION_NOT_FOUND" };
  const cap = Math.min(100, Math.max(1, Number(limit) || 50));
  const messages = await agentChatMessageModel
    .find({ sessionId })
    .sort({ createdAt: 1 })
    .limit(cap)
    .lean();
  return { ok: true, session, messages };
}

export async function handleAgentChat({
  userId,
  message,
  sessionId,
  language = "en",
}) {
  const text = String(message || "").trim();
  if (!text) return { ok: false, code: "EMPTY_MESSAGE" };

  const { intent, confidence: intentConfidence } = classifyAgentIntent(text);
  const session = await ensureAgentSession(userId, sessionId, language);
  const tools = await runAgentTools({ intent, userId, message: text });
  let confidence = Math.max(intentConfidence, confidenceFromToolTrace(tools));

  const factsBlock = tools.map((t) => `[${t.name}]\n${t.summary || ""}`).join("\n\n");
  let reply = composeRuleReply(intent, tools);
  let replySource = "rule";

  const skipGemini =
    appConfig.skipGeminiOnLowConfidence && confidence < appConfig.agentConfidenceThreshold;
  if (!skipGemini) {
    const gemini = await synthesizeAgentReply({
      intent,
      userMessage: text,
      factsBlock,
      language,
    });
    if (gemini) {
      reply = gemini;
      replySource = "gemini";
      confidence = Math.min(0.95, confidence + 0.05);
    }
  }

  reply = appendLowConfidenceNote(reply, confidence);

  const userMsg = await agentChatMessageModel.create({
    sessionId: session._id,
    userId: String(userId),
    role: "user",
    body: text,
    intent,
  });

  const assistantMsg = await agentChatMessageModel.create({
    sessionId: session._id,
    userId: String(userId),
    role: "assistant",
    body: reply,
    intent,
    confidence,
    replySource,
    tools: tools.map((t) => ({
      name: t.name,
      ok: t.ok,
      confidence: t.confidence,
    })),
    ragSources: tools.find((t) => t.name === "faq_rag")?.data?.sources || null,
  });

  session.lastIntent = intent;
  session.lastMessageAt = new Date();
  session.messageCount = (session.messageCount || 0) + 2;
  session.language = language || session.language;
  await session.save();

  return {
    ok: true,
    sessionId: String(session._id),
    intent,
    confidence: Math.round(confidence * 10000) / 10000,
    needsVerification: confidence < appConfig.agentConfidenceThreshold,
    replySource,
    reply,
    tools,
    messageIds: {
      user: String(userMsg._id),
      assistant: String(assistantMsg._id),
    },
  };
}
