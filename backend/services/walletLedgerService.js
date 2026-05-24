import walletLedgerEntryModel from "../models/walletLedgerEntryModel.js";

/**
 * @param {{
 *   userId: string,
 *   amount: number,
 *   currency?: string,
 *   entryType: string,
 *   refType?: string,
 *   refId?: string,
 *   description?: string,
 *   metadata?: object,
 *   idempotencyKey?: string,
 * }} params
 */
export async function appendLedgerEntry(params) {
  const {
    userId,
    amount,
    currency = "INR",
    entryType,
    refType = "",
    refId = "",
    description = "",
    metadata = {},
    idempotencyKey,
  } = params;

  if (idempotencyKey) {
    const existing = await walletLedgerEntryModel.findOne({ idempotencyKey });
    if (existing) {
      return { entry: existing, replay: true };
    }
  }

  const entry = await walletLedgerEntryModel.create({
    userId: String(userId),
    amount,
    currency,
    entryType,
    refType,
    refId,
    description,
    metadata,
    idempotencyKey: idempotencyKey || undefined,
  });

  return { entry, replay: false };
}

export async function getLedgerBalance(userId, currency = "INR") {
  const [row] = await walletLedgerEntryModel.aggregate([
    { $match: { userId: String(userId), currency } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return row?.total ?? 0;
}

export async function listLedgerEntries(userId, { page = 1, limit = 20, currency } = {}) {
  const actualLimit = Math.min(Math.max(1, limit), 100);
  const skip = (Math.max(1, page) - 1) * actualLimit;
  const q = { userId: String(userId) };
  if (currency) q.currency = currency;

  const [entries, total] = await Promise.all([
    walletLedgerEntryModel
      .find(q)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(actualLimit)
      .lean(),
    walletLedgerEntryModel.countDocuments(q),
  ]);

  return {
    entries,
    pagination: {
      page,
      limit: actualLimit,
      total,
      totalPages: Math.ceil(total / actualLimit) || 0,
    },
  };
}
