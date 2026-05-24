import * as payoutBatchService from "../services/payoutBatchService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

function normalizeStatuses(input) {
  if (!input) return ["delivered"];
  if (Array.isArray(input)) return input.filter(Boolean);
  if (typeof input === "string") {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return ["delivered"];
}

const previewPayout = async (req, res) => {
  try {
    const { periodStart, periodEnd, restaurantId } = req.body;
    if (!periodStart || !periodEnd) {
      return sendError(res, req, 400, "periodStart and periodEnd are required");
    }
    const statuses = normalizeStatuses(req.body.statuses);
    const data = await payoutBatchService.computePayoutAggregate(periodStart, periodEnd, {
      restaurantId: restaurantId || null,
      statuses,
    });
    sendSuccess(res, req, 200, { success: true, data });
  } catch (error) {
    console.error("previewPayout:", error);
    sendError(res, req, 400, error.message || "Invalid payout preview");
  }
};

const createPayoutBatch = async (req, res) => {
  try {
    const { periodStart, periodEnd, status, currency, restaurantId, notes } = req.body;
    if (!periodStart || !periodEnd) {
      return sendError(res, req, 400, "periodStart and periodEnd are required");
    }
    const statuses = normalizeStatuses(req.body.statuses);
    const doc = await payoutBatchService.createPayoutBatchRecord(periodStart, periodEnd, {
      status:
        status === "finalized" || status === "paid" || status === "reconciled"
          ? status
          : "draft",
      currency: currency || "INR",
      restaurantId: restaurantId || null,
      statuses,
      notes: notes || "",
    });
    sendSuccess(res, req, 201, {
      success: true,
      message: "Payout batch created",
      data: doc,
    });
  } catch (error) {
    console.error("createPayoutBatch:", error);
    sendError(res, req, 400, error.message || "Could not create payout batch");
  }
};

const listPayoutBatches = async (req, res) => {
  try {
    const result = await payoutBatchService.listPayoutBatches({
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
      periodStart: req.query.periodStart,
      periodEnd: req.query.periodEnd,
      belowMinimum: req.query.belowMinimum,
    });
    sendSuccess(res, req, 200, { success: true, ...result });
  } catch (error) {
    console.error("listPayoutBatches:", error);
    sendError(res, req, 500, "Could not load payout batches");
  }
};

const getPayoutBatchById = async (req, res) => {
  try {
    const doc = await payoutBatchService.getPayoutBatchById(req.params.batchId);
    if (!doc) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    sendSuccess(res, req, 200, { success: true, data: doc });
  } catch (error) {
    console.error("getPayoutBatchById:", error);
    sendError(res, req, 500, "Could not load payout batch");
  }
};

const updatePayoutBatchStatus = async (req, res) => {
  try {
    const doc = await payoutBatchService.updatePayoutBatchStatus(req.params.batchId, {
      status: req.body.status,
      notes: req.body.notes,
      paidReference: req.body.paidReference,
    });
    sendSuccess(res, req, 200, {
      success: true,
      message: "Payout batch updated",
      data: doc,
    });
  } catch (error) {
    console.error("updatePayoutBatchStatus:", error);
    sendError(res, req, 400, error.message || "Could not update payout batch");
  }
};

const exportPayoutBatchCsv = async (req, res) => {
  try {
    const doc = await payoutBatchService.getPayoutBatchById(req.params.batchId);
    if (!doc) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    const csv = payoutBatchService.buildPayoutCsv(doc);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payout-batch-${doc._id}.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    console.error("exportPayoutBatchCsv:", error);
    sendError(res, req, 500, "Could not export payout CSV");
  }
};

const partnerListPayoutBatches = async (req, res) => {
  try {
    const restaurantId = req.partnerRestaurantId || req.body.staffRestaurantId;
    if (!restaurantId) {
      return sendError(res, req, 403, "No restaurant scope for payouts");
    }
    const result = await payoutBatchService.listPayoutBatchesForRestaurant(restaurantId, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });
    sendSuccess(res, req, 200, { success: true, ...result });
  } catch (error) {
    console.error("partnerListPayoutBatches:", error);
    sendError(res, req, 400, error.message || "Could not load payout batches");
  }
};

const partnerGetPayoutBatch = async (req, res) => {
  try {
    const restaurantId = req.partnerRestaurantId || req.body.staffRestaurantId;
    if (!restaurantId) {
      return sendError(res, req, 403, "No restaurant scope for payouts");
    }
    const doc = await payoutBatchService.getPayoutBatchById(req.params.batchId);
    if (!doc) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    const sliced = payoutBatchService.slicePayoutBatchForRestaurant(doc, restaurantId);
    if (!sliced) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    sendSuccess(res, req, 200, { success: true, data: sliced });
  } catch (error) {
    console.error("partnerGetPayoutBatch:", error);
    sendError(res, req, 500, "Could not load payout batch");
  }
};

const partnerExportPayoutCsv = async (req, res) => {
  try {
    const restaurantId = req.partnerRestaurantId || req.body.staffRestaurantId;
    if (!restaurantId) {
      return sendError(res, req, 403, "No restaurant scope for payouts");
    }
    const doc = await payoutBatchService.getPayoutBatchById(req.params.batchId);
    if (!doc) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    const csv = payoutBatchService.buildPartnerPayoutCsv(doc, restaurantId);
    if (!csv) {
      return sendError(res, req, 404, "Payout batch not found");
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payout-batch-${doc._id}-partner.csv"`
    );
    res.status(200).send(csv);
  } catch (error) {
    console.error("partnerExportPayoutCsv:", error);
    sendError(res, req, 500, "Could not export payout CSV");
  }
};

export {
  previewPayout,
  createPayoutBatch,
  listPayoutBatches,
  getPayoutBatchById,
  updatePayoutBatchStatus,
  exportPayoutBatchCsv,
  partnerListPayoutBatches,
  partnerGetPayoutBatch,
  partnerExportPayoutCsv,
};
