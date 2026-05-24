import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import restaurantModel from "../models/restaurantModel.js";
import payoutBatchModel from "../models/payoutBatchModel.js";

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function parsePayoutPeriod(periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid period dates");
  }
  if (start > end) {
    throw new Error("periodStart must be before periodEnd");
  }
  return { start, end };
}

/**
 * Aggregate orders in a period by restaurant (commission snapshot or fallback).
 */
export async function computePayoutAggregate(periodStart, periodEnd, options = {}) {
  const { start, end } = parsePayoutPeriod(periodStart, periodEnd);
  const {
    restaurantId = null,
    statuses = ["delivered"],
  } = options;

  const statusFilter = Array.isArray(statuses) && statuses.length > 0 ? statuses : ["delivered"];
  const match = {
    restaurantId: { $exists: true, $ne: null },
    createdAt: { $gte: start, $lte: end },
    status: { $in: statusFilter, $nin: ["cancelled"] },
  };
  if (restaurantId) {
    match.restaurantId = restaurantId;
  }

  const grouped = await orderModel.aggregate([
    {
      $match: match,
    },
    {
      $addFields: {
        effectiveBasis: {
          $ifNull: [
            "$commissionSnapshot.basisAmount",
            { $subtract: ["$amount", { $ifNull: ["$discount", 0] }] },
          ],
        },
        effectiveCommission: { $ifNull: ["$commissionSnapshot.amount", 0] },
        effectiveNet: {
          $ifNull: [
            "$commissionSnapshot.estimatedRestaurantNet",
            {
              $subtract: [
                { $ifNull: ["$commissionSnapshot.basisAmount", { $subtract: ["$amount", { $ifNull: ["$discount", 0] }] }] },
                { $ifNull: ["$commissionSnapshot.amount", 0] },
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$restaurantId",
        orderCount: { $sum: 1 },
        itemsBasis: { $sum: "$effectiveBasis" },
        commission: { $sum: "$effectiveCommission" },
        estimatedNet: { $sum: "$effectiveNet" },
      },
    },
  ]);

  let orderCount = 0;
  let totalCommission = 0;
  let totalEstimatedRestaurantNet = 0;

  const byRestaurant = [];
  for (const row of grouped) {
    const r = await restaurantModel.findById(row._id).select("name minimumPayoutAmount");
    const itemsBasis = round2(row.itemsBasis);
    const commission = round2(row.commission);
    const estimatedNet = round2(row.estimatedNet);
    const minPayout = Math.max(0, Number(r?.minimumPayoutAmount) || 0);
    const meetsMinimumPayout = minPayout <= 0 || estimatedNet >= minPayout;
    orderCount += row.orderCount;
    totalCommission += commission;
    totalEstimatedRestaurantNet += estimatedNet;
    byRestaurant.push({
      restaurantId: row._id,
      restaurantName: r?.name || "",
      orderCount: row.orderCount,
      itemsBasis,
      commission,
      estimatedNet,
      minimumPayoutAmount: minPayout,
      meetsMinimumPayout,
    });
  }

  return {
    periodStart: start,
    periodEnd: end,
    statuses: statusFilter,
    orderCount,
    totalCommission: round2(totalCommission),
    totalEstimatedRestaurantNet: round2(totalEstimatedRestaurantNet),
    byRestaurant,
  };
}

export async function createPayoutBatchRecord(periodStart, periodEnd, options = {}) {
  const {
    status = "draft",
    currency = "INR",
    restaurantId = null,
    statuses = ["delivered"],
    notes = "",
  } = options;
  const agg = await computePayoutAggregate(periodStart, periodEnd, { restaurantId, statuses });
  const now = new Date();
  const doc = await payoutBatchModel.create({
    periodStart: agg.periodStart,
    periodEnd: agg.periodEnd,
    status,
    currency: currency || "INR",
    orderCount: agg.orderCount,
    totalCommission: agg.totalCommission,
    totalEstimatedRestaurantNet: agg.totalEstimatedRestaurantNet,
    byRestaurant: agg.byRestaurant,
    notes: notes || "",
    finalizedAt: status === "finalized" || status === "paid" || status === "reconciled" ? now : null,
    paidAt: status === "paid" || status === "reconciled" ? now : null,
    reconciledAt: status === "reconciled" ? now : null,
  });
  return doc;
}

export async function listPayoutBatches({
  page = 1,
  limit = 20,
  status,
  periodStart,
  periodEnd,
  belowMinimum,
}) {
  const actualPage = Math.max(1, parseInt(page, 10) || 1);
  const actualLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (actualPage - 1) * actualLimit;

  const query = {};
  if (status) query.status = status;
  if (belowMinimum === true || belowMinimum === "true") {
    query["byRestaurant.meetsMinimumPayout"] = false;
  } else if (belowMinimum === false || belowMinimum === "false") {
    query["byRestaurant.meetsMinimumPayout"] = true;
  }
  if (periodStart || periodEnd) {
    query.periodStart = {};
    if (periodStart) query.periodStart.$gte = new Date(periodStart);
    if (periodEnd) query.periodStart.$lte = new Date(periodEnd);
  }

  const [rows, total] = await Promise.all([
    payoutBatchModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(actualLimit),
    payoutBatchModel.countDocuments(query),
  ]);

  const data = rows.map((b) => {
    const plain = typeof b.toObject === "function" ? b.toObject() : b;
    const belowMinimumRestaurantCount = Array.isArray(plain.byRestaurant)
      ? plain.byRestaurant.filter((r) => r?.meetsMinimumPayout === false).length
      : 0;
    return {
      ...plain,
      belowMinimumRestaurantCount,
    };
  });

  return {
    data,
    pagination: {
      page: actualPage,
      limit: actualLimit,
      total,
      totalPages: Math.ceil(total / actualLimit),
      hasNext: actualPage < Math.ceil(total / actualLimit),
      hasPrev: actualPage > 1,
    },
  };
}

export async function getPayoutBatchById(batchId) {
  return payoutBatchModel.findById(batchId);
}

export function toPayoutBatchPlain(doc) {
  if (!doc) return null;
  return typeof doc.toObject === "function" ? doc.toObject() : doc;
}

export function slicePayoutBatchForRestaurant(batchDoc, restaurantIdStr) {
  const batch = toPayoutBatchPlain(batchDoc);
  if (!batch) return null;
  const sid = String(restaurantIdStr);
  const row = (batch.byRestaurant || []).find((b) => String(b.restaurantId) === sid);
  if (!row) return null;
  return {
    _id: batch._id,
    periodStart: batch.periodStart,
    periodEnd: batch.periodEnd,
    status: batch.status,
    currency: batch.currency || "INR",
    paidReference: batch.paidReference || "",
    finalizedAt: batch.finalizedAt,
    paidAt: batch.paidAt,
    reconciledAt: batch.reconciledAt,
    createdAt: batch.createdAt,
    restaurantPayout: row,
  };
}

export async function listPayoutBatchesForRestaurant(restaurantId, opts = {}) {
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    throw new Error("Invalid restaurantId");
  }
  const rid = new mongoose.Types.ObjectId(restaurantId);
  const { page = 1, limit = 20, status } = opts;
  const actualPage = Math.max(1, parseInt(page, 10) || 1);
  const actualLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (actualPage - 1) * actualLimit;

  const query = { "byRestaurant.restaurantId": rid };
  if (status) query.status = status;

  const [data, total] = await Promise.all([
    payoutBatchModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(actualLimit)
      .lean(),
    payoutBatchModel.countDocuments(query),
  ]);

  const sliced = data
    .map((d) => slicePayoutBatchForRestaurant(d, restaurantId))
    .filter(Boolean);

  return {
    data: sliced,
    pagination: {
      page: actualPage,
      limit: actualLimit,
      total,
      totalPages: Math.ceil(total / actualLimit),
      hasNext: actualPage < Math.ceil(total / actualLimit),
      hasPrev: actualPage > 1,
    },
  };
}

export function buildPartnerPayoutCsv(batchDoc, restaurantIdStr) {
  const batch = toPayoutBatchPlain(batchDoc);
  if (!batch) return null;
  const sid = String(restaurantIdStr);
  const r = (batch.byRestaurant || []).find((b) => String(b.restaurantId) === sid);
  if (!r) return null;
  const rows = [
    [
      "batchId",
      "status",
      "currency",
      "periodStart",
      "periodEnd",
      "restaurantId",
      "restaurantName",
      "orderCount",
      "itemsBasis",
      "commission",
      "estimatedNet",
      "minimumPayoutAmount",
      "meetsMinimumPayout",
      "paidReference",
    ],
    [
      String(batch._id),
      String(batch.status || ""),
      String(batch.currency || "INR"),
      new Date(batch.periodStart).toISOString(),
      new Date(batch.periodEnd).toISOString(),
      String(r.restaurantId || ""),
      String(r.restaurantName || ""),
      String(r.orderCount ?? 0),
      String(r.itemsBasis ?? 0),
      String(r.commission ?? 0),
      String(r.estimatedNet ?? 0),
      String(r.minimumPayoutAmount ?? 0),
      String(r.meetsMinimumPayout !== false),
      String(batch.paidReference || ""),
    ],
  ];
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell ?? "").replace(/"/g, '""');
          return `"${safe}"`;
        })
        .join(",")
    )
    .join("\n");
}

export async function updatePayoutBatchStatus(batchId, { status, notes = "", paidReference = "" }) {
  const doc = await payoutBatchModel.findById(batchId);
  if (!doc) {
    throw new Error("Payout batch not found");
  }
  const allowed = {
    draft: ["finalized"],
    finalized: ["paid"],
    paid: ["reconciled"],
    reconciled: [],
  };
  const can = allowed[doc.status] || [];
  if (!can.includes(status)) {
    throw new Error(`Invalid transition from ${doc.status} to ${status}`);
  }
  doc.status = status;
  if (typeof notes === "string") doc.notes = notes;
  if (typeof paidReference === "string" && paidReference.trim()) {
    doc.paidReference = paidReference.trim();
  }
  if (status === "finalized" && !doc.finalizedAt) doc.finalizedAt = new Date();
  if (status === "paid" && !doc.paidAt) {
    doc.paidAt = new Date();
    if (!doc.finalizedAt) doc.finalizedAt = doc.paidAt;
  }
  if (status === "reconciled" && !doc.reconciledAt) {
    doc.reconciledAt = new Date();
    if (!doc.paidAt) doc.paidAt = doc.reconciledAt;
    if (!doc.finalizedAt) doc.finalizedAt = doc.reconciledAt;
  }
  await doc.save();
  return doc;
}

export function buildPayoutCsv(batch) {
  const rows = [
    [
      "batchId",
      "status",
      "currency",
      "periodStart",
      "periodEnd",
      "restaurantId",
      "restaurantName",
      "orderCount",
      "itemsBasis",
      "commission",
      "estimatedNet",
      "minimumPayoutAmount",
      "meetsMinimumPayout",
      "paidReference",
    ],
  ];
  for (const r of batch.byRestaurant || []) {
    rows.push([
      String(batch._id),
      String(batch.status || ""),
      String(batch.currency || "INR"),
      new Date(batch.periodStart).toISOString(),
      new Date(batch.periodEnd).toISOString(),
      String(r.restaurantId || ""),
      String(r.restaurantName || ""),
      String(r.orderCount ?? 0),
      String(r.itemsBasis ?? 0),
      String(r.commission ?? 0),
      String(r.estimatedNet ?? 0),
      String(r.minimumPayoutAmount ?? 0),
      String(r.meetsMinimumPayout !== false),
      String(batch.paidReference || ""),
    ]);
  }
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const safe = String(cell ?? "").replace(/"/g, '""');
          return `"${safe}"`;
        })
        .join(",")
    )
    .join("\n");
}
