import paymentModel from "../models/paymentModel.js";
import paymentWebhookEventModel from "../models/paymentWebhookEventModel.js";
import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";

function buildCreatedAtMatch(from, to) {
  const createdAtMatch = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  };
  return Object.keys(createdAtMatch).length ? { createdAt: createdAtMatch } : {};
}

function webhookCollection() {
  return paymentWebhookEventModel.collection.collectionName;
}

function orderCollection() {
  return orderModel.collection.collectionName;
}

/**
 * Day-wise webhook deliveries (reportedStatus from payload).
 */
export async function aggregateWebhookEventsByDay(from, to) {
  const match = buildCreatedAtMatch(from, to);
  return paymentWebhookEventModel.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: {
          day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        },
        webhookEventCount: { $sum: 1 },
        webhookReportedSuccess: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "success"] }, 1, 0] },
        },
        webhookReportedFailed: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "failed"] }, 1, 0] },
        },
        webhookReportedCancelled: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "cancelled"] }, 1, 0] },
        },
        webhookLegacyNoReportedStatus: {
          $sum: {
            $cond: [
              { $in: ["$reportedStatus", ["success", "failed", "cancelled"]] },
              0,
              1,
            ],
          },
        },
      },
    },
    { $sort: { "_id.day": 1 } },
  ]);
}

export async function aggregateWebhookEventTotals(from, to) {
  const match = buildCreatedAtMatch(from, to);
  const rows = await paymentWebhookEventModel.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: null,
        webhookEventCount: { $sum: 1 },
        webhookReportedSuccess: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "success"] }, 1, 0] },
        },
        webhookReportedFailed: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "failed"] }, 1, 0] },
        },
        webhookReportedCancelled: {
          $sum: { $cond: [{ $eq: ["$reportedStatus", "cancelled"] }, 1, 0] },
        },
        webhookLegacyNoReportedStatus: {
          $sum: {
            $cond: [
              { $in: ["$reportedStatus", ["success", "failed", "cancelled"]] },
              0,
              1,
            ],
          },
        },
      },
    },
  ]);
  return (
    rows[0] || {
      webhookEventCount: 0,
      webhookReportedSuccess: 0,
      webhookReportedFailed: 0,
      webhookReportedCancelled: 0,
      webhookLegacyNoReportedStatus: 0,
    }
  );
}

/**
 * Payments created in range whose latest webhook (any time) disagrees with current payment.status.
 */
export async function findWebhookVsPaymentDrift(from, to, limit) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const cap = Math.min(200, Math.max(1, limit || 50));
  const whCol = webhookCollection();

  const rows = await paymentModel.aggregate([
    ...(Object.keys(paymentMatch).length ? [{ $match: paymentMatch }] : []),
    {
      $lookup: {
        from: whCol,
        let: { pid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$paymentId", "$$pid"] },
                  { $in: ["$reportedStatus", ["success", "failed", "cancelled"]] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { reportedStatus: 1, createdAt: 1 } },
        ],
        as: "lastWh",
      },
    },
    { $match: { "lastWh.0": { $exists: true } } },
    {
      $addFields: {
        lastReported: { $arrayElemAt: ["$lastWh.reportedStatus", 0] },
        lastWebhookAt: { $arrayElemAt: ["$lastWh.createdAt", 0] },
      },
    },
    {
      $addFields: {
        drift: {
          $or: [
            {
              $and: [
                { $in: ["$lastReported", ["failed", "cancelled"]] },
                { $eq: ["$status", "success"] },
              ],
            },
            {
              $and: [
                { $eq: ["$lastReported", "success"] },
                {
                  $in: [
                    "$status",
                    ["pending", "processing", "failed", "cancelled"],
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $match: { drift: true } },
    { $sort: { lastWebhookAt: -1 } },
    { $limit: cap },
    {
      $project: {
        paymentId: "$_id",
        orderNumber: 1,
        paymentStatus: "$status",
        lastWebhookReported: "$lastReported",
        lastWebhookAt: 1,
        amount: 1,
        paymentMethod: 1,
      },
    },
  ]);

  return rows;
}

export async function countWebhookVsPaymentDrift(from, to) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const whCol = webhookCollection();
  const rows = await paymentModel.aggregate([
    ...(Object.keys(paymentMatch).length ? [{ $match: paymentMatch }] : []),
    {
      $lookup: {
        from: whCol,
        let: { pid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$paymentId", "$$pid"] },
                  { $in: ["$reportedStatus", ["success", "failed", "cancelled"]] },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
          { $project: { reportedStatus: 1 } },
        ],
        as: "lastWh",
      },
    },
    { $match: { "lastWh.0": { $exists: true } } },
    {
      $addFields: {
        lastReported: { $arrayElemAt: ["$lastWh.reportedStatus", 0] },
      },
    },
    {
      $addFields: {
        drift: {
          $or: [
            {
              $and: [
                { $in: ["$lastReported", ["failed", "cancelled"]] },
                { $eq: ["$status", "success"] },
              ],
            },
            {
              $and: [
                { $eq: ["$lastReported", "success"] },
                {
                  $in: [
                    "$status",
                    ["pending", "processing", "failed", "cancelled"],
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $match: { drift: true } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

/**
 * Payments in range where order.payment snapshot disagrees with payment document.
 */
export async function findOrderPaymentMismatches(from, to, limit) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const cap = Math.min(200, Math.max(1, limit || 50));
  const ordCol = orderCollection();

  const rows = await paymentModel.aggregate([
    ...(Object.keys(paymentMatch).length ? [{ $match: paymentMatch }] : []),
    {
      $lookup: {
        from: ordCol,
        localField: "orderId",
        foreignField: "_id",
        as: "ord",
      },
    },
    { $unwind: { path: "$ord", preserveNullAndEmptyArrays: false } },
    {
      $addFields: {
        orderPaymentStatus: { $ifNull: ["$ord.payment.status", "pending"] },
      },
    },
    {
      $addFields: {
        mismatch: {
          $or: [
            {
              $and: [
                { $eq: ["$status", "success"] },
                { $ne: ["$orderPaymentStatus", "paid"] },
              ],
            },
            {
              $and: [
                { $eq: ["$status", "refunded"] },
                { $eq: ["$orderPaymentStatus", "paid"] },
              ],
            },
            {
              $and: [
                {
                  $in: [
                    "$status",
                    ["pending", "processing", "failed", "cancelled"],
                  ],
                },
                { $eq: ["$orderPaymentStatus", "paid"] },
              ],
            },
          ],
        },
      },
    },
    { $match: { mismatch: true } },
    { $sort: { updatedAt: -1 } },
    { $limit: cap },
    {
      $project: {
        paymentId: "$_id",
        orderId: "$orderId",
        orderNumber: 1,
        paymentStatus: "$status",
        orderPaymentStatus: 1,
        amount: 1,
        paymentMethod: 1,
      },
    },
  ]);

  return rows;
}

export async function countOrderPaymentMismatches(from, to) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const ordCol = orderCollection();
  const rows = await paymentModel.aggregate([
    ...(Object.keys(paymentMatch).length ? [{ $match: paymentMatch }] : []),
    {
      $lookup: {
        from: ordCol,
        localField: "orderId",
        foreignField: "_id",
        as: "ord",
      },
    },
    { $unwind: { path: "$ord", preserveNullAndEmptyArrays: false } },
    {
      $addFields: {
        orderPaymentStatus: { $ifNull: ["$ord.payment.status", "pending"] },
      },
    },
    {
      $addFields: {
        mismatch: {
          $or: [
            {
              $and: [
                { $eq: ["$status", "success"] },
                { $ne: ["$orderPaymentStatus", "paid"] },
              ],
            },
            {
              $and: [
                { $eq: ["$status", "refunded"] },
                { $eq: ["$orderPaymentStatus", "paid"] },
              ],
            },
            {
              $and: [
                {
                  $in: [
                    "$status",
                    ["pending", "processing", "failed", "cancelled"],
                  ],
                },
                { $eq: ["$orderPaymentStatus", "paid"] },
              ],
            },
          ],
        },
      },
    },
    { $match: { mismatch: true } },
    { $count: "n" },
  ]);
  return rows[0]?.n || 0;
}

/**
 * Online payments still pending/processing, created before cutoff, within createdAt range.
 */
export async function findStaleOnlinePending(from, to, olderThanMs, limit) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const cap = Math.min(200, Math.max(1, limit || 50));
  const cutoff = new Date(Date.now() - olderThanMs);

  const rows = await paymentModel.aggregate([
    {
      $match: {
        ...paymentMatch,
        status: { $in: ["pending", "processing"] },
        paymentMethod: { $ne: "cash_on_delivery" },
        createdAt: { $lte: cutoff },
      },
    },
    { $sort: { createdAt: 1 } },
    { $limit: cap },
    {
      $project: {
        paymentId: "$_id",
        orderNumber: 1,
        status: 1,
        amount: 1,
        paymentMethod: 1,
        createdAt: 1,
        providerPaymentId: 1,
      },
    },
  ]);

  return rows;
}

export async function countStaleOnlinePending(from, to, olderThanMs) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const cutoff = new Date(Date.now() - olderThanMs);
  const r = await paymentModel.countDocuments({
    ...paymentMatch,
    status: { $in: ["pending", "processing"] },
    paymentMethod: { $ne: "cash_on_delivery" },
    createdAt: { $lte: cutoff },
  });
  return r;
}

/** Successful Razorpay rows missing provider reference (audit). */
export async function findSuccessRazorpayMissingRefs(from, to, limit) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  const cap = Math.min(200, Math.max(1, limit || 50));

  const rows = await paymentModel.aggregate([
    {
      $match: {
        ...paymentMatch,
        status: "success",
        paymentMethod: "razorpay",
        $or: [
          { transactionId: { $in: [null, ""] } },
          { providerPaymentId: { $in: [null, ""] } },
        ],
      },
    },
    { $sort: { createdAt: -1 } },
    { $limit: cap },
    {
      $project: {
        paymentId: "$_id",
        orderNumber: 1,
        transactionId: 1,
        providerPaymentId: 1,
        amount: 1,
        createdAt: 1,
      },
    },
  ]);

  return rows;
}

export async function countSuccessRazorpayMissingRefs(from, to) {
  const paymentMatch = buildCreatedAtMatch(from, to);
  return paymentModel.countDocuments({
    ...paymentMatch,
    status: "success",
    paymentMethod: "razorpay",
    $or: [
      { transactionId: { $in: [null, ""] } },
      { providerPaymentId: { $in: [null, ""] } },
    ],
  });
}

export async function buildExtendedReconciliationPayload(from, to) {
  const cap = appConfig.reconciliationDepthSampleCap;
  const staleMs = appConfig.reconciliationStalePendingHours * 3600 * 1000;

  const [
    webhookDays,
    webhookTotals,
    driftSamples,
    driftCount,
    mismatchSamples,
    mismatchCount,
    staleSamples,
    staleCount,
    missingRefSamples,
    missingRefCount,
  ] = await Promise.all([
    aggregateWebhookEventsByDay(from, to),
    aggregateWebhookEventTotals(from, to),
    findWebhookVsPaymentDrift(from, to, cap),
    countWebhookVsPaymentDrift(from, to),
    findOrderPaymentMismatches(from, to, cap),
    countOrderPaymentMismatches(from, to),
    findStaleOnlinePending(from, to, staleMs, cap),
    countStaleOnlinePending(from, to, staleMs),
    findSuccessRazorpayMissingRefs(from, to, cap),
    countSuccessRazorpayMissingRefs(from, to),
  ]);

  return {
    webhookDays: webhookDays.map((r) => ({
      day: r._id.day,
      webhookEventCount: r.webhookEventCount,
      webhookReportedSuccess: r.webhookReportedSuccess,
      webhookReportedFailed: r.webhookReportedFailed,
      webhookReportedCancelled: r.webhookReportedCancelled,
      webhookLegacyNoReportedStatus: r.webhookLegacyNoReportedStatus,
    })),
    webhookTotals: {
      webhookEventCount: webhookTotals.webhookEventCount,
      webhookReportedSuccess: webhookTotals.webhookReportedSuccess,
      webhookReportedFailed: webhookTotals.webhookReportedFailed,
      webhookReportedCancelled: webhookTotals.webhookReportedCancelled,
      webhookLegacyNoReportedStatus: webhookTotals.webhookLegacyNoReportedStatus,
    },
    webhookVsPaymentDrift: {
      sampleCap: cap,
      count: driftCount,
      samples: driftSamples.map((x) => ({
        ...x,
        paymentId: x.paymentId?.toString?.() ?? x.paymentId,
      })),
    },
    orderPaymentMismatch: {
      sampleCap: cap,
      count: mismatchCount,
      samples: mismatchSamples.map((x) => ({
        ...x,
        paymentId: x.paymentId?.toString?.() ?? x.paymentId,
        orderId: x.orderId?.toString?.() ?? x.orderId,
      })),
    },
    staleOnlinePending: {
      olderThanHours: appConfig.reconciliationStalePendingHours,
      count: staleCount,
      totalMatching: staleCount,
      sampleCap: cap,
      samples: staleSamples.map((x) => ({
        ...x,
        paymentId: x.paymentId?.toString?.() ?? x.paymentId,
      })),
    },
    successRazorpayMissingRefs: {
      count: missingRefCount,
      totalMatching: missingRefCount,
      sampleCap: cap,
      samples: missingRefSamples.map((x) => ({
        ...x,
        paymentId: x.paymentId?.toString?.() ?? x.paymentId,
      })),
    },
  };
}

function escCsv(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

export function buildReconciliationIssuesCsvRows(payload) {
  const header = [
    "rowType",
    "paymentId",
    "orderNumber",
    "detail1",
    "detail2",
    "detail3",
    "amount",
    "paymentMethod",
    "extra",
  ];
  const lines = [header.map(escCsv).join(",")];

  for (const row of payload.webhookVsPaymentDrift?.samples || []) {
    lines.push(
      [
        "webhook_vs_payment_drift",
        row.paymentId,
        row.orderNumber,
        row.paymentStatus,
        row.lastWebhookReported,
        row.lastWebhookAt
          ? new Date(row.lastWebhookAt).toISOString()
          : "",
        row.amount,
        row.paymentMethod,
        "",
      ]
        .map(escCsv)
        .join(",")
    );
  }
  for (const row of payload.orderPaymentMismatch?.samples || []) {
    lines.push(
      [
        "order_payment_mismatch",
        row.paymentId,
        row.orderNumber,
        row.paymentStatus,
        row.orderPaymentStatus,
        "",
        row.amount,
        row.paymentMethod,
        row.orderId || "",
      ]
        .map(escCsv)
        .join(",")
    );
  }
  for (const row of payload.staleOnlinePending?.samples || []) {
    lines.push(
      [
        "stale_online_pending",
        row.paymentId,
        row.orderNumber,
        row.status,
        row.createdAt ? new Date(row.createdAt).toISOString() : "",
        row.providerPaymentId || "",
        row.amount,
        row.paymentMethod,
        "",
      ]
        .map(escCsv)
        .join(",")
    );
  }
  for (const row of payload.successRazorpayMissingRefs?.samples || []) {
    lines.push(
      [
        "success_razorpay_missing_ref",
        row.paymentId,
        row.orderNumber,
        row.transactionId || "",
        row.providerPaymentId || "",
        "",
        row.amount,
        "",
        row.createdAt ? new Date(row.createdAt).toISOString() : "",
      ]
        .map(escCsv)
        .join(",")
    );
  }

  return lines.join("\n");
}
