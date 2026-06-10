import { appConfig } from "../config/appConfig.js";
import { classifyAgentIntent } from "../services/agentIntentService.js";
import {
  handleAgentChat,
  listAgentChatHistory,
} from "../services/agentChatService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const postAgentChat = async (req, res) => {
  try {
    if (!appConfig.enableAiAgent) {
      return sendError(res, req, 503, "AI agent is disabled (set ENABLE_AI_AGENT=true)");
    }
    const userId = req.body.userId;
    const { message, sessionId, language } = req.body;
    const result = await handleAgentChat({
      userId,
      message,
      sessionId,
      language,
    });
    if (!result.ok) {
      const code = result.code === "EMPTY_MESSAGE" ? 400 : 400;
      return sendError(res, req, code, result.code || "Could not process message");
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("postAgentChat:", error);
    return sendError(res, req, 500, "Error processing agent chat");
  }
};

export const postClassifyChat = async (req, res) => {
  try {
    if (!appConfig.enableAiAgent) {
      return sendError(res, req, 503, "AI agent is disabled");
    }
    const { message } = req.body;
    if (!message || String(message).trim().length < 1) {
      return sendError(res, req, 400, "message is required");
    }
    const result = classifyAgentIntent(message);
    return sendSuccess(res, req, 200, {
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("postClassifyChat:", error);
    return sendError(res, req, 500, "Error classifying message");
  }
};

export const getAgentChatHistory = async (req, res) => {
  try {
    if (!appConfig.enableAiAgent) {
      return sendError(res, req, 503, "AI agent is disabled");
    }
    const userId = req.body.userId;
    const { sessionId } = req.params;
    const limit = Number(req.query.limit) || 50;
    const result = await listAgentChatHistory(sessionId, userId, { limit });
    if (!result.ok) {
      return sendError(res, req, 404, result.code || "Session not found");
    }
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        session: result.session,
        messages: result.messages,
      },
    });
  } catch (error) {
    console.error("getAgentChatHistory:", error);
    return sendError(res, req, 500, "Error loading chat history");
  }
};
