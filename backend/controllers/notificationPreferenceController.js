import {
  getOrCreatePreferences,
  updatePreferences,
} from "../services/notificationPreferenceService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req.body.userId;
    const row = await getOrCreatePreferences(userId);
    return sendSuccess(res, req, 200, {
      success: true,
      data: row.categories,
    });
  } catch (error) {
    console.error("getNotificationPreferences:", error);
    return sendError(res, req, 500, "Error loading notification preferences");
  }
};

export const putNotificationPreferences = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { categories } = req.body;
    if (!categories || typeof categories !== "object") {
      return sendError(res, req, 400, "categories object is required");
    }
    const row = await updatePreferences(userId, categories);
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Preferences updated",
      data: row.categories,
    });
  } catch (error) {
    console.error("putNotificationPreferences:", error);
    return sendError(res, req, 500, "Error updating notification preferences");
  }
};
