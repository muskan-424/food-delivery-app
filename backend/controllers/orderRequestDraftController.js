import { appConfig } from "../config/appConfig.js";
import {
  createOrderRequestDraft,
  getOrderRequestDraft,
  updateOrderRequestDraft,
  listMyOrderRequestDrafts,
  listRestaurantOrderRequestInbox,
} from "../services/orderRequestDraftService.js";
import {
  publishOrderRequestDraft,
  PublishOrderRequestError,
} from "../services/orderRequestPublishService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

function gateEnabled(res, req) {
  if (!appConfig.enableOrderRequestDrafts) {
    sendError(res, req, 503, "Order request drafts are disabled");
    return false;
  }
  return true;
}

export const postOrderRequestDraft = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const userId = req.body.userId;
    const { rawInput, language, restaurantId } = req.body;
    const result = await createOrderRequestDraft({ userId, rawInput, language, restaurantId });
    if (!result.ok) {
      return sendError(res, req, 400, result.code || "Could not create draft");
    }
    return sendSuccess(res, req, 201, { success: true, data: result.draft });
  } catch (error) {
    console.error("postOrderRequestDraft:", error);
    return sendError(res, req, 500, "Error creating order request draft");
  }
};

export const getOrderRequestDraftById = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const userId = req.body.userId;
    const { draftId } = req.params;
    const result = await getOrderRequestDraft(draftId, userId, {
      isAdmin: req.body.role === "admin",
    });
    if (!result.ok) {
      const code = result.code === "NOT_FOUND" ? 404 : 403;
      return sendError(res, req, code, result.code);
    }
    return sendSuccess(res, req, 200, { success: true, data: result.draft });
  } catch (error) {
    console.error("getOrderRequestDraftById:", error);
    return sendError(res, req, 500, "Error loading draft");
  }
};

export const patchOrderRequestDraft = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const userId = req.body.userId;
    const { draftId } = req.params;
    const { userEdits, restaurantId } = req.body;
    const result = await updateOrderRequestDraft(draftId, userId, { userEdits, restaurantId });
    if (!result.ok) {
      const code =
        result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400;
      return sendError(res, req, code, result.code);
    }
    return sendSuccess(res, req, 200, { success: true, data: result.draft });
  } catch (error) {
    console.error("patchOrderRequestDraft:", error);
    return sendError(res, req, 500, "Error updating draft");
  }
};

export const publishOrderRequestDraftHandler = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const userId = req.body.userId;
    const { draftId } = req.params;
    const { restaurantId } = req.body;
    try {
      const result = await publishOrderRequestDraft(draftId, userId, { restaurantId });
      return sendSuccess(res, req, 200, {
        success: true,
        message: "Order request published",
        data: {
          draft: {
            id: String(result.draft._id),
            status: result.draft.status,
            publishedAt: result.draft.publishedAt,
            restaurantId: result.draft.restaurantId ? String(result.draft.restaurantId) : null,
          },
          notified: result.notifyResult.notified,
        },
      });
    } catch (e) {
      if (e instanceof PublishOrderRequestError) {
        const status =
          e.code === "not_found"
            ? 404
            : e.code === "forbidden"
              ? 403
              : e.code === "conflict"
                ? 409
                : 400;
        return sendError(res, req, status, e.message);
      }
      throw e;
    }
  } catch (error) {
    console.error("publishOrderRequestDraftHandler:", error);
    return sendError(res, req, 500, "Error publishing draft");
  }
};

export const listMyOrderRequestDraftsHandler = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const userId = req.body.userId;
    const rows = await listMyOrderRequestDrafts(userId, { limit: req.query.limit });
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listMyOrderRequestDraftsHandler:", error);
    return sendError(res, req, 500, "Error listing drafts");
  }
};

export const listRestaurantOrderRequestInboxHandler = async (req, res) => {
  try {
    if (!gateEnabled(res, req)) return;
    const restaurantId = req.body.staffRestaurantId || req.query.restaurantId;
    if (!restaurantId) {
      return sendError(res, req, 400, "restaurant context required");
    }
    const rows = await listRestaurantOrderRequestInbox(restaurantId, {
      status: req.query.status || "published",
      limit: req.query.limit,
    });
    return sendSuccess(res, req, 200, { success: true, data: rows });
  } catch (error) {
    console.error("listRestaurantOrderRequestInboxHandler:", error);
    return sendError(res, req, 500, "Error loading restaurant inbox");
  }
};
