import orderRequestDraftModel from "../models/orderRequestDraftModel.js";
import { resolveOrderRequestSchema, validateOrderRequestSchema } from "./orderRequestSchemaService.js";

function serializeDraft(doc) {
  const d = doc?.toObject ? doc.toObject() : doc;
  const effectiveSchema = d.userEdits || d.aiSchema;
  return {
    id: String(d._id),
    userId: String(d.userId),
    restaurantId: d.restaurantId ? String(d.restaurantId) : null,
    status: d.status,
    rawInput: d.rawInput,
    aiSchema: effectiveSchema,
    userEdits: d.userEdits || null,
    schemaProvider: d.schemaProvider,
    aiExplain: d.aiExplain || "",
    publishedAt: d.publishedAt,
    validationErrors: d.validationErrors || [],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function createOrderRequestDraft({ userId, rawInput, language, restaurantId }) {
  const text = String(rawInput || "").trim();
  if (text.length < 10) {
    return { ok: false, code: "INPUT_TOO_SHORT" };
  }

  const { schema, provider, validation } = await resolveOrderRequestSchema(text, language);
  const draft = await orderRequestDraftModel.create({
    userId,
    restaurantId: restaurantId || null,
    rawInput: text,
    aiSchema: schema,
    schemaProvider: provider,
    aiExplain: `Structured draft from ${provider} parser. Edit fields before publish.`,
    validationErrors: validation.valid ? [] : validation.errors,
  });

  return { ok: true, draft: serializeDraft(draft) };
}

export async function getOrderRequestDraft(draftId, userId, { isAdmin = false } = {}) {
  const draft = await orderRequestDraftModel.findById(draftId);
  if (!draft) return { ok: false, code: "NOT_FOUND" };
  if (!isAdmin && String(draft.userId) !== String(userId)) {
    return { ok: false, code: "FORBIDDEN" };
  }
  return { ok: true, draft: serializeDraft(draft) };
}

export async function updateOrderRequestDraft(draftId, userId, { userEdits, restaurantId }) {
  const draft = await orderRequestDraftModel.findById(draftId);
  if (!draft) return { ok: false, code: "NOT_FOUND" };
  if (String(draft.userId) !== String(userId)) return { ok: false, code: "FORBIDDEN" };
  if (draft.status !== "draft") return { ok: false, code: "NOT_EDITABLE" };

  if (userEdits && typeof userEdits === "object") {
    draft.userEdits = userEdits;
    const validation = validateOrderRequestSchema(userEdits);
    draft.validationErrors = validation.valid ? [] : validation.errors;
  }
  if (restaurantId !== undefined) {
    draft.restaurantId = restaurantId || null;
  }
  await draft.save();
  return { ok: true, draft: serializeDraft(draft) };
}

export async function listMyOrderRequestDrafts(userId, { limit = 20 } = {}) {
  const cap = Math.min(50, Math.max(1, Number(limit) || 20));
  const rows = await orderRequestDraftModel
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(cap)
    .lean();
  return rows.map(serializeDraft);
}

export async function listRestaurantOrderRequestInbox(restaurantId, { status = "published", limit = 30 } = {}) {
  const cap = Math.min(100, Math.max(1, Number(limit) || 30));
  const filter = { restaurantId, status: status || "published" };
  const rows = await orderRequestDraftModel.find(filter).sort({ publishedAt: -1 }).limit(cap).lean();
  return rows.map(serializeDraft);
}
