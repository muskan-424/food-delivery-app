import foodModel from "../models/foodModel.js";

/**
 * Atomically decrease stock for each line. Rolls back prior lines if any update fails (race-safe commit).
 * @param {{ foodId: import('mongoose').Types.ObjectId, quantity: number }[]} lines
 */
export async function commitStockForLines(lines) {
  const applied = [];
  for (const { foodId, quantity } of lines) {
    const updated = await foodModel.findOneAndUpdate(
      {
        _id: foodId,
        isAvailable: true,
        stockCount: { $gte: quantity },
      },
      { $inc: { stockCount: -quantity } },
      { new: true }
    );
    if (!updated) {
      for (const a of applied) {
        await foodModel.updateOne({ _id: a.foodId }, { $inc: { stockCount: a.quantity } });
      }
      return { ok: false };
    }
    applied.push({ foodId, quantity });
  }
  return { ok: true };
}

/**
 * Restore stock for order lines (foods that use finite stockCount). Safe for untracked items (no-op).
 * @param {{ foodId: import('mongoose').Types.ObjectId, quantity: number }[]} items
 */
export async function restoreStockForOrderItems(items) {
  for (const line of items) {
    if (!line?.foodId || !line.quantity) continue;
    await foodModel.updateOne(
      { _id: line.foodId, stockCount: { $ne: null } },
      { $inc: { stockCount: line.quantity } }
    );
  }
}
