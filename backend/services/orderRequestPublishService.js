import orderRequestDraftModel from "../models/orderRequestDraftModel.js";
import restaurantModel from "../models/restaurantModel.js";
import userModel from "../models/userModel.js";
import notificationModel from "../models/notificationModel.js";
import { validateOrderRequestSchema } from "./orderRequestSchemaService.js";

export class PublishOrderRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function notifyRestaurantStaff(draft) {
  if (!draft.restaurantId) return { notified: 0 };

  const restaurant = await restaurantModel.findById(draft.restaurantId).select("name").lean();
  const staff = await userModel
    .find({
      "restaurantStaff.restaurantId": draft.restaurantId,
      "restaurantStaff.active": true,
      "restaurantStaff.permissions": { $in: ["order.manage", "restaurant.manage"] },
    })
    .select("_id")
    .lean();

  const schema = draft.userEdits || draft.aiSchema;
  const title = String(schema?.title || "Custom order request");
  let notified = 0;

  for (const row of staff) {
    await notificationModel.create({
      userId: String(row._id),
      title: "New custom order request",
      body: `${title}${restaurant?.name ? ` — ${restaurant.name}` : ""}`,
      type: "order_request",
      refType: "orderRequestDraft",
      refId: String(draft._id),
      metadata: {
        restaurantId: String(draft.restaurantId),
        eventType: schema?.eventType || "custom",
        guestCount: schema?.guestCount ?? null,
      },
    });
    notified += 1;
  }

  const admins = await userModel.find({ role: "admin" }).select("_id").limit(5).lean();
  for (const admin of admins) {
    await notificationModel.create({
      userId: String(admin._id),
      title: "Custom order request published",
      body: title,
      type: "order_request",
      refType: "orderRequestDraft",
      refId: String(draft._id),
      metadata: { restaurantId: String(draft.restaurantId || "") },
    });
    notified += 1;
  }

  return { notified };
}

export async function publishOrderRequestDraft(draftId, userId, { restaurantId } = {}) {
  const draft = await orderRequestDraftModel.findById(draftId);
  if (!draft) throw new PublishOrderRequestError("not_found", "Draft not found");
  if (String(draft.userId) !== String(userId)) {
    throw new PublishOrderRequestError("forbidden", "Not allowed to publish this draft");
  }
  if (draft.status === "published") {
    throw new PublishOrderRequestError("conflict", "Draft already published");
  }
  if (draft.status === "cancelled") {
    throw new PublishOrderRequestError("invalid_state", "Draft is cancelled");
  }

  if (restaurantId) draft.restaurantId = restaurantId;
  if (!draft.restaurantId) {
    throw new PublishOrderRequestError("restaurant_required", "restaurantId is required to publish");
  }

  const schema = draft.userEdits || draft.aiSchema;
  const validation = validateOrderRequestSchema(schema);
  if (!validation.valid) {
    draft.validationErrors = validation.errors;
    await draft.save();
    throw new PublishOrderRequestError("validation_failed", validation.errors.join("; "));
  }

  draft.status = "published";
  draft.publishedAt = new Date();
  draft.validationErrors = [];
  await draft.save();

  const notifyResult = await notifyRestaurantStaff(draft);
  return { draft, notifyResult };
}
