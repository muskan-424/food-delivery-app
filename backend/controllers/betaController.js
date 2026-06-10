import {
  getBetaConfigPayload,
  submitBetaFeedback,
} from "../services/betaService.js";
import { getBetaKpiSnapshot } from "../services/betaKpiService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const getBetaConfig = async (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    data: getBetaConfigPayload(),
  });
};

export const postBetaFeedback = async (req, res) => {
  try {
    const userId = req.body.userId || "";
    const { category, message, page_path: pagePath, email } = req.body;
    const result = await submitBetaFeedback({
      userId,
      email,
      category,
      message,
      pagePath,
    });
    if (!result.ok) {
      const msg =
        result.code === "MESSAGE_TOO_SHORT"
          ? "Message must be at least 5 characters"
          : "Message too long";
      return sendError(res, req, 400, msg);
    }
    return sendSuccess(res, req, 201, {
      success: true,
      data: { feedbackId: result.feedbackId },
    });
  } catch (error) {
    console.error("postBetaFeedback:", error);
    return sendError(res, req, 500, "Error saving feedback");
  }
};

export const getBetaKpis = async (req, res) => {
  try {
    const data = await getBetaKpiSnapshot();
    return sendSuccess(res, req, 200, { success: true, data });
  } catch (error) {
    console.error("getBetaKpis:", error);
    return sendError(res, req, 500, "Error loading beta KPIs");
  }
};
