import orderEventModel from "../models/orderEventModel.js";

/**
 * Record an order event. Does not throw — logs on failure so order flow is not blocked.
 * @param {{ orderId: import('mongoose').Types.ObjectId | string, type: string, payload?: object, actor?: { kind?: string, id?: string } }} params
 */
export async function recordOrderEvent({ orderId, type, payload = {}, actor = {} }) {
  try {
    const doc = await orderEventModel.create({
      orderId,
      type,
      payload,
      actor: {
        kind: actor.kind || "system",
        id: actor.id != null ? String(actor.id) : "",
      },
    });
    return doc;
  } catch (err) {
    console.error("recordOrderEvent failed:", err.message);
    return null;
  }
}
