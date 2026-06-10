import paymentModel from "../models/paymentModel.js";
import orderModel from "../models/orderModel.js";
import { appConfig } from "../config/appConfig.js";
import { transitionOrderById } from "../services/orderTransitionService.js";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  fetchRazorpayPayment,
  getPublishableKeyId,
  isRazorpayConfigured,
  verifyRazorpayPaymentSignature,
} from "../services/razorpayService.js";
import {
  appendLedgerEntry,
  getLedgerBalance,
  listLedgerEntries,
} from "../services/walletLedgerService.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import { sendPaymentReceiptEmailIfNeeded } from "../services/orderReceiptEmailService.js";
import {
  buildExtendedReconciliationPayload,
  buildReconciliationIssuesCsvRows,
} from "../services/paymentReconciliationService.js";
import {
  ensureEscrowForOrder,
  getEscrowByOrderId,
  onEscrowPaymentCaptured,
  recordEscrowRefundInitiated,
  aggregateEscrowByDay,
  getEscrowMetricsSummary,
} from "../services/escrowService.js";

function normalizeClientIdempotencyKey(req) {
  const fromBody = (req.body?.clientIdempotencyKey || "").trim();
  const fromHeader =
    (req.headers["idempotency-key"] || req.headers["x-idempotency-key"] || "").trim();
  const key = fromBody || fromHeader;
  if (key.length >= 10 && key.length <= 200) return key;
  return "";
}

// Create payment record
const createPayment = async (req, res) => {
  try {
    const { orderId, paymentMethod, paymentProvider, paymentDetails } = req.body;
    const userId = req.body.userId;

    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }

    if (!orderId) {
      return sendError(res, req, 400, "Order ID is required");
    }

    const clientIdempotencyKey = normalizeClientIdempotencyKey(req);
    if (clientIdempotencyKey) {
      const idem = await paymentModel.findOne({
        userId: String(userId),
        clientIdempotencyKey,
      });
      if (idem) {
        return sendSuccess(res, req, 200, {
          success: true,
          message: "Payment record (idempotent replay)",
          data: idem,
          idempotentReplay: true,
        });
      }
    }

    // Find the order
    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    // Check if payment already exists
    const existingPayment = await paymentModel.findOne({ orderId });
    if (existingPayment) {
      return sendError(res, req, 409, "Payment already exists for this order", {
        paymentId: existingPayment._id,
      });
    }

    // Create payment record
    const payment = new paymentModel({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: String(userId),
      amount: order.finalAmount,
      currency: 'INR',
      paymentMethod: paymentMethod || 'cash_on_delivery',
      paymentProvider: paymentProvider || '',
      status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing',
      paymentDetails: paymentDetails || {},
      transactionId: '',
      paymentReference: '',
      clientIdempotencyKey: clientIdempotencyKey || undefined,
      breakdown: {
        itemsSubtotal: order.amount || 0,
        deliveryFeeAmount: order.deliveryFee || 0,
        discountAmount: order.discount || 0,
        tipAmount: order.tipAmount || 0,
        serviceFeeAmount: order.serviceFeeAmount || 0,
        loyaltyRedeemInr: order.loyaltyRedeemInr || 0,
      },
    });

    try {
      await payment.save();
    } catch (err) {
      if (err?.code === 11000 && clientIdempotencyKey) {
        const idem = await paymentModel.findOne({
          userId: String(userId),
          clientIdempotencyKey,
        });
        if (idem) {
          return sendSuccess(res, req, 200, {
            success: true,
            message: "Payment record (idempotent replay)",
            data: idem,
            idempotentReplay: true,
          });
        }
      }
      throw err;
    }

    // Update order payment status
    order.payment = {
      status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing',
      method: paymentMethod,
      transactionId: '',
      paidAt: null
    };
    await order.save();

    sendSuccess(res, req, 201, {
      success: true,
      message: "Payment record created",
      data: payment
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    sendError(res, req, 500, "Error creating payment", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Process payment (simulate payment processing)
const processPayment = async (req, res) => {
  try {
    const { transactionId, paymentReference, status, providerPaymentId } = req.body;
    const paymentId = req.body.paymentId || req.params.paymentId;
    const userId = req.body.userId;

    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }

    const payment = await paymentModel.findOne({ _id: paymentId, userId });
    if (!payment) {
      return sendError(res, req, 404, "Payment not found");
    }

    // Update payment status
    if (status) {
      if (!['success', 'failed', 'cancelled'].includes(status)) {
        return sendError(res, req, 400, "Invalid payment status");
      }
      payment.status = status;
    }

    if (transactionId) payment.transactionId = transactionId;
    if (paymentReference) payment.paymentReference = paymentReference;
    if (providerPaymentId) payment.providerPaymentId = providerPaymentId;

    if (status === 'success') {
      payment.paidAt = new Date();
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment = {
          status: 'paid',
          method: payment.paymentMethod,
          transactionId: transactionId || payment.transactionId,
          paidAt: new Date()
        };
        await order.save();
      }
    } else if (status === 'failed') {
      payment.failureReason = req.body.failureReason || 'Payment failed';
    }

    await payment.save();

    if (status === "success") {
      void sendPaymentReceiptEmailIfNeeded(payment._id).catch((e) =>
        console.error("payment receipt email:", e)
      );
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: `Payment ${status}`,
      data: payment
    });
  } catch (error) {
    console.error("Error processing payment:", error);
    sendError(res, req, 500, "Error processing payment", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get user payments
const getUserPayments = async (req, res) => {
  try {
    const userId = req.body.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }

    const payments = await paymentModel
      .find({ userId })
      .populate('orderId', 'orderNumber status items')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const total = await paymentModel.countDocuments({ userId });

    sendSuccess(res, req, 200, {
      success: true,
      data: payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching user payments:", error);
    sendError(res, req, 500, "Error fetching payments");
  }
};

// Get payment by ID
const getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const userId = req.body.userId;

    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }

    const payment = await paymentModel
      .findOne({ _id: paymentId, userId })
      .populate('orderId');

    if (!payment) {
      return sendError(res, req, 404, "Payment not found");
    }

    sendSuccess(res, req, 200, {
      success: true,
      data: payment
    });
  } catch (error) {
    console.error("Error fetching payment:", error);
    sendError(res, req, 500, "Error fetching payment");
  }
};

// Admin: Get all payments
const getAllPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const maxLimit = 100;
    const actualLimit = Math.min(limit, maxLimit);
    const skip = (page - 1) * actualLimit;

    // Build query for filtering
    const query = {};

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.paymentMethod) {
      query.paymentMethod = req.query.paymentMethod;
    }

    if (req.query.orderId) {
      query.orderId = req.query.orderId;
    }

    if (req.query.userId) {
      query.userId = req.query.userId;
    }

    if (req.query.orderNumber) {
      query.orderNumber = { $regex: req.query.orderNumber, $options: 'i' };
    }

    if (req.query.transactionId) {
      query.transactionId = { $regex: req.query.transactionId, $options: 'i' };
    }

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        query.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    const payments = await paymentModel
      .find(query)
      .populate('orderId', 'orderNumber status items address')
      .sort({ createdAt: -1 })
      .limit(actualLimit)
      .skip(skip);

    const total = await paymentModel.countDocuments(query);

    // Calculate statistics
    const allPayments = await paymentModel.find({});
    const stats = {
      total: allPayments.length,
      totalAmount: allPayments.reduce((sum, p) => sum + (p.status === 'success' ? p.amount : 0), 0),
      success: allPayments.filter(p => p.status === 'success').length,
      failed: allPayments.filter(p => p.status === 'failed').length,
      pending: allPayments.filter(p => p.status === 'pending' || p.status === 'processing').length,
      refunded: allPayments.filter(p => p.status === 'refunded').length,
      byMethod: {}
    };

    // Group by payment method
    allPayments.forEach(payment => {
      if (!stats.byMethod[payment.paymentMethod]) {
        stats.byMethod[payment.paymentMethod] = {
          count: 0,
          amount: 0
        };
      }
      if (payment.status === 'success') {
        stats.byMethod[payment.paymentMethod].count++;
        stats.byMethod[payment.paymentMethod].amount += payment.amount;
      }
    });

    sendSuccess(res, req, 200, {
      success: true,
      data: payments,
      pagination: {
        page,
        limit: actualLimit,
        total,
        totalPages: Math.ceil(total / actualLimit),
        hasNext: page < Math.ceil(total / actualLimit),
        hasPrev: page > 1
      },
      statistics: stats
    });
  } catch (error) {
    console.error("Error fetching payments:", error);
    sendError(res, req, 500, "Error fetching payments");
  }
};

// Admin: Update payment status
const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, transactionId, failureReason, providerPaymentId } = req.body;

    if (!status || !['pending', 'processing', 'success', 'failed', 'refunded', 'cancelled'].includes(status)) {
      return sendError(res, req, 400, "Valid status is required");
    }

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return sendError(res, req, 404, "Payment not found");
    }

    payment.status = status;
    if (transactionId) payment.transactionId = transactionId;
    if (failureReason) payment.failureReason = failureReason;
    if (providerPaymentId) payment.providerPaymentId = providerPaymentId;

    if (status === 'success' && !payment.paidAt) {
      payment.paidAt = new Date();
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment = {
          status: 'paid',
          method: payment.paymentMethod,
          transactionId: transactionId || payment.transactionId,
          paidAt: new Date()
        };
        await order.save();
      }
    }

    if (status === 'refunded') {
      payment.refundDetails = {
        refundAmount: req.body.refundAmount || payment.amount,
        refundReason: req.body.refundReason || '',
        refundedAt: new Date(),
        refundTransactionId: req.body.refundTransactionId || ''
      };
      
      // Update order payment status
      const order = await orderModel.findById(payment.orderId);
      if (order) {
        order.payment.status = 'refunded';
        await order.save();
      }
    }

    await payment.save();

    if (status === "success") {
      void sendPaymentReceiptEmailIfNeeded(payment._id).catch((e) =>
        console.error("payment receipt email:", e)
      );
    }

    sendSuccess(res, req, 200, {
      success: true,
      message: "Payment status updated",
      data: payment
    });
  } catch (error) {
    console.error("Error updating payment status:", error);
    sendError(res, req, 500, "Error updating payment status");
  }
};

// Admin: Process refund
const processRefund = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refundAmount, refundReason, refundTransactionId } = req.body;

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return sendError(res, req, 404, "Payment not found");
    }

    if (payment.status !== 'success') {
      return sendError(res, req, 400, "Only successful payments can be refunded");
    }

    const refundAmt = Number(refundAmount || payment.amount);
    if (!Number.isFinite(refundAmt) || refundAmt <= 0) {
      return sendError(res, req, 400, "refundAmount must be a positive number");
    }
    if (refundAmt > Number(payment.amount)) {
      return sendError(res, req, 400, "refundAmount cannot exceed payment amount");
    }

    let providerRefundReference = refundTransactionId || "";
    let providerRefundMeta = null;
    const isRazorpayPayment =
      payment.paymentMethod === "razorpay" ||
      String(payment.paymentProvider || "").toLowerCase() === "razorpay";
    if (isRazorpayPayment) {
      const providerPaymentRef =
        String(payment.transactionId || "").trim() ||
        String(payment.providerPaymentId || "").trim();
      if (!providerPaymentRef) {
        return sendError(
          res,
          req,
          400,
          "Cannot process provider refund: missing Razorpay payment reference"
        );
      }
      if (!isRazorpayConfigured()) {
        return sendError(
          res,
          req,
          503,
          "Razorpay refunds unavailable: missing RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET"
        );
      }
      const refundResponse = await createRazorpayRefund(providerPaymentRef, {
        amountPaise: Math.round(refundAmt * 100),
        notes: {
          paymentId: String(payment._id),
          orderId: String(payment.orderId),
          reason: String(refundReason || "").slice(0, 120),
        },
      });
      providerRefundReference = String(refundResponse?.id || providerRefundReference);
      providerRefundMeta = {
        provider: "razorpay",
        status: refundResponse?.status || "",
        providerPaymentId: providerPaymentRef,
      };
    }

    payment.status = 'refunded';
    payment.refundDetails = {
      refundAmount: refundAmt,
      refundReason: refundReason || '',
      refundedAt: new Date(),
      refundTransactionId: providerRefundReference
    };
    if (providerRefundMeta) {
      payment.refundDetails.provider = providerRefundMeta;
    }

    await payment.save();

    // Update order payment status
    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment.status = 'refunded';
      await order.save();
    }

    if (appConfig.enableWalletLedger) {
      const ledgerRefundAmt = payment.refundDetails?.refundAmount ?? payment.amount;
      await appendLedgerEntry({
        userId: payment.userId,
        amount: ledgerRefundAmt,
        currency: payment.currency || "INR",
        entryType: "refund_credit",
        refType: "payment",
        refId: String(payment._id),
        description: "Refund to wallet ledger",
        idempotencyKey: `refund:${payment._id}`,
      });
    }

    await recordEscrowRefundInitiated(payment.orderId, {
      refundAmount: refundAmt,
      refundId: providerRefundReference,
      actor: { kind: "admin", id: String(req.body.userId || "") },
    });

    sendSuccess(res, req, 200, {
      success: true,
      message: "Refund processed successfully",
      data: payment
    });
  } catch (error) {
    console.error("Error processing refund:", error);
    sendError(res, req, 500, "Error processing refund");
  }
};

const getPaymentReconciliationDaily = async (req, res) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return sendError(res, req, 400, "Invalid from date. Use ISO date-time");
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return sendError(res, req, 400, "Invalid to date. Use ISO date-time");
    }
    if (from && to && from > to) {
      return sendError(res, req, 400, "from must be less than or equal to to");
    }

    const createdAtMatch = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
    const match = Object.keys(createdAtMatch).length
      ? { createdAt: createdAtMatch }
      : {};

    const [rows, totalsRow] = await Promise.all([
      paymentModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              day: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
            },
            totalCount: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] },
            },
            refundedCount: {
              $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
            processingCount: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["pending", "processing"]] },
                  1,
                  0,
                ],
              },
            },
            successAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "success"] }, "$amount", 0],
              },
            },
            refundedAmount: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "refunded"] },
                  { $ifNull: ["$refundDetails.refundAmount", "$amount"] },
                  0,
                ],
              },
            },
            tipSuccessTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "success"] },
                  { $ifNull: ["$breakdown.tipAmount", 0] },
                  0,
                ],
              },
            },
            serviceFeeSuccessTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "success"] },
                  { $ifNull: ["$breakdown.serviceFeeAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
        { $sort: { "_id.day": 1 } },
      ]),
      paymentModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            successCount: {
              $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] },
            },
            refundedCount: {
              $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
            processingCount: {
              $sum: {
                $cond: [{ $in: ["$status", ["pending", "processing"]] }, 1, 0],
              },
            },
            successAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", "success"] }, "$amount", 0],
              },
            },
            refundedAmount: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "refunded"] },
                  { $ifNull: ["$refundDetails.refundAmount", "$amount"] },
                  0,
                ],
              },
            },
            tipSuccessTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "success"] },
                  { $ifNull: ["$breakdown.tipAmount", 0] },
                  0,
                ],
              },
            },
            serviceFeeSuccessTotal: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "success"] },
                  { $ifNull: ["$breakdown.serviceFeeAmount", 0] },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const totals = totalsRow?.[0] || {
      totalCount: 0,
      successCount: 0,
      refundedCount: 0,
      failedCount: 0,
      processingCount: 0,
      successAmount: 0,
      refundedAmount: 0,
      tipSuccessTotal: 0,
      serviceFeeSuccessTotal: 0,
    };

    const extended =
      req.query.extended === "1" ||
      req.query.extended === "true" ||
      req.query.depth === "extended";
    let depth = null;
    if (extended) {
      if (!from || !to) {
        return sendError(
          res,
          req,
          400,
          "Extended reconciliation requires both from and to date bounds"
        );
      }
      depth = await buildExtendedReconciliationPayload(from, to);
    }

    const [escrowByDay, escrowTotals] = await Promise.all([
      aggregateEscrowByDay(from, to),
      getEscrowMetricsSummary(),
    ]);

    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        filters: {
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
        },
        totals,
        days: rows.map((r) => ({
          day: r._id.day,
          ...r,
          _id: undefined,
        })),
        escrow: {
          enabled: appConfig.enableEscrowPayments,
          totals: escrowTotals.byStatus,
          byDay: escrowByDay.map((r) => ({
            day: r._id.day,
            status: r._id.status,
            count: r.count,
            amount: Math.round(r.amount * 100) / 100,
          })),
        },
        ...(depth ? { depth } : {}),
      },
    });
  } catch (error) {
    console.error("Error generating payment reconciliation report:", error);
    return sendError(res, req, 500, "Error generating payment reconciliation report");
  }
};

const exportPaymentReconciliationDailyCsv = async (req, res) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (fromRaw && Number.isNaN(from?.getTime())) {
      return sendError(res, req, 400, "Invalid from date. Use ISO date-time");
    }
    if (toRaw && Number.isNaN(to?.getTime())) {
      return sendError(res, req, 400, "Invalid to date. Use ISO date-time");
    }
    if (from && to && from > to) {
      return sendError(res, req, 400, "from must be less than or equal to to");
    }

    const createdAtMatch = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    };
    const match = Object.keys(createdAtMatch).length
      ? { createdAt: createdAtMatch }
      : {};

    const rows = await paymentModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            day: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
          },
          totalCount: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ["$status", "success"] }, 1, 0] },
          },
          refundedCount: {
            $sum: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] },
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          processingCount: {
            $sum: {
              $cond: [{ $in: ["$status", ["pending", "processing"]] }, 1, 0],
            },
          },
          successAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", "success"] }, "$amount", 0],
            },
          },
          refundedAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", "refunded"] },
                { $ifNull: ["$refundDetails.refundAmount", "$amount"] },
                0,
              ],
            },
          },
          tipSuccessTotal: {
            $sum: {
              $cond: [
                { $eq: ["$status", "success"] },
                { $ifNull: ["$breakdown.tipAmount", 0] },
                0,
              ],
            },
          },
          serviceFeeSuccessTotal: {
            $sum: {
              $cond: [
                { $eq: ["$status", "success"] },
                { $ifNull: ["$breakdown.serviceFeeAmount", 0] },
                0,
              ],
            },
          },
        },
      },
      { $sort: { "_id.day": 1 } },
    ]);

    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = [
      "day",
      "totalCount",
      "successCount",
      "refundedCount",
      "failedCount",
      "processingCount",
      "successAmount",
      "refundedAmount",
      "netAmount",
      "tipSuccessTotal",
      "serviceFeeSuccessTotal",
    ];
    const lines = [header.map(esc).join(",")];
    for (const row of rows) {
      const day = row?._id?.day || "";
      const successAmount = Number(row?.successAmount || 0);
      const refundedAmount = Number(row?.refundedAmount || 0);
      const netAmount = successAmount - refundedAmount;
      const tipOk = Number(row?.tipSuccessTotal || 0);
      const feeOk = Number(row?.serviceFeeSuccessTotal || 0);
      lines.push(
        [
          day,
          row?.totalCount || 0,
          row?.successCount || 0,
          row?.refundedCount || 0,
          row?.failedCount || 0,
          row?.processingCount || 0,
          successAmount.toFixed(2),
          refundedAmount.toFixed(2),
          netAmount.toFixed(2),
          tipOk.toFixed(2),
          feeOk.toFixed(2),
        ]
          .map(esc)
          .join(",")
      );
    }

    const fromTag = from ? from.toISOString().slice(0, 10) : "all";
    const toTag = to ? to.toISOString().slice(0, 10) : "all";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payment-reconciliation-${fromTag}_to_${toTag}.csv"`
    );
    return res.status(200).send(lines.join("\n"));
  } catch (error) {
    console.error("Error exporting payment reconciliation CSV:", error);
    return sendError(res, req, 500, "Error exporting payment reconciliation CSV");
  }
};

const exportPaymentReconciliationIssuesCsv = async (req, res) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (!fromRaw || !toRaw || Number.isNaN(from?.getTime()) || Number.isNaN(to?.getTime())) {
      return sendError(
        res,
        req,
        400,
        "Issues CSV requires valid from and to query parameters (ISO date-time)"
      );
    }
    if (from > to) {
      return sendError(res, req, 400, "from must be less than or equal to to");
    }

    const depth = await buildExtendedReconciliationPayload(from, to);
    const csv = buildReconciliationIssuesCsvRows(depth);
    const fromTag = from.toISOString().slice(0, 10);
    const toTag = to.toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payment-reconciliation-issues-${fromTag}_to_${toTag}.csv"`
    );
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Error exporting reconciliation issues CSV:", error);
    return sendError(res, req, 500, "Error exporting reconciliation issues CSV");
  }
};

// Admin: Create payment manually
const adminCreatePayment = async (req, res) => {
  try {
    const { orderId, userId, amount, paymentMethod, paymentProvider, paymentDetails, status, transactionId, clientIdempotencyKey: bodyKey } = req.body;

    if (!orderId || !userId || !amount) {
      return sendError(res, req, 400, "orderId, userId, and amount are required");
    }

    // Check if order exists
    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    // Check if payment already exists
    const existingPayment = await paymentModel.findOne({ orderId });
    if (existingPayment) {
      return sendError(res, req, 409, "Payment already exists for this order");
    }

    const adminKey = (bodyKey || "").trim();
    if (adminKey.length >= 10 && adminKey.length <= 200) {
      const idem = await paymentModel.findOne({
        userId: String(userId),
        clientIdempotencyKey: adminKey,
      });
      if (idem) {
        return sendSuccess(res, req, 200, {
          success: true,
          message: "Payment (idempotent replay)",
          data: idem,
          idempotentReplay: true,
        });
      }
    }

    // Create payment record
    const payment = new paymentModel({
      orderId: order._id,
      orderNumber: order.orderNumber,
      userId: String(userId),
      amount: amount || order.finalAmount,
      currency: 'INR',
      paymentMethod: paymentMethod || 'cash_on_delivery',
      paymentProvider: paymentProvider || '',
      status: status || 'processing',
      paymentDetails: paymentDetails || {},
      transactionId: transactionId || '',
      paymentReference: '',
      clientIdempotencyKey:
        adminKey.length >= 10 && adminKey.length <= 200 ? adminKey : undefined,
      breakdown: {
        itemsSubtotal: order.amount || 0,
        deliveryFeeAmount: order.deliveryFee || 0,
        discountAmount: order.discount || 0,
        tipAmount: order.tipAmount || 0,
        serviceFeeAmount: order.serviceFeeAmount || 0,
        loyaltyRedeemInr: order.loyaltyRedeemInr || 0,
      },
    });

    try {
      await payment.save();
    } catch (err) {
      if (err?.code === 11000 && adminKey.length >= 10) {
        const idem = await paymentModel.findOne({
          userId: String(userId),
          clientIdempotencyKey: adminKey,
        });
        if (idem) {
          return sendSuccess(res, req, 200, {
            success: true,
            message: "Payment (idempotent replay)",
            data: idem,
            idempotentReplay: true,
          });
        }
      }
      throw err;
    }

    // Update order payment status
    order.payment = {
      status: status || 'processing',
      method: paymentMethod || 'cash_on_delivery',
      transactionId: transactionId || '',
      paidAt: status === 'success' ? new Date() : null
    };
    await order.save();

    if ((status || "") === "success") {
      void sendPaymentReceiptEmailIfNeeded(payment._id).catch((e) =>
        console.error("payment receipt email:", e)
      );
    }

    sendSuccess(res, req, 201, {
      success: true,
      message: "Payment created successfully",
      data: payment
    });
  } catch (error) {
    console.error("Error creating payment:", error);
    sendError(res, req, 500, "Error creating payment");
  }
};

// Admin: Delete payment
const adminDeletePayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await paymentModel.findById(paymentId);
    if (!payment) {
      return sendError(res, req, 404, "Payment not found");
    }

    // Check if payment is successful (usually shouldn't delete successful payments)
    if (payment.status === 'success') {
      return sendError(res, req, 400, "Cannot delete successful payments");
    }

    // Update order payment status
    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment = {
        status: 'cancelled',
        method: payment.paymentMethod,
        transactionId: '',
        paidAt: null
      };
      await order.save();
    }

    await paymentModel.findByIdAndDelete(paymentId);

    sendSuccess(res, req, 200, {
      success: true,
      message: "Payment deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting payment:", error);
    sendError(res, req, 500, "Error deleting payment");
  }
};

const getWalletBalance = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }
    const currency = req.query.currency || "INR";
    const balance = await getLedgerBalance(userId, currency);
    sendSuccess(res, req, 200, {
      success: true,
      data: { balance, currency },
    });
  } catch (error) {
    console.error("Error loading wallet balance:", error);
    sendError(res, req, 500, "Error loading wallet balance");
  }
};

const getWalletLedger = async (req, res) => {
  try {
    const userId = req.body.userId;
    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const currency = req.query.currency;
    const result = await listLedgerEntries(userId, { page, limit, currency });
    sendSuccess(res, req, 200, { success: true, ...result });
  } catch (error) {
    console.error("Error loading wallet ledger:", error);
    sendError(res, req, 500, "Error loading wallet ledger");
  }
};

/** Create Razorpay order for Checkout (after place order with paymentMethod razorpay). */
const createRazorpayCheckoutOrder = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return sendError(
        res,
        req,
        503,
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }
    const userId = req.body.userId;
    const { orderId } = req.body;
    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }
    if (!orderId) {
      return sendError(res, req, 400, "orderId is required");
    }

    const order = await orderModel.findOne({ _id: orderId, userId });
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }

    const payment = await paymentModel.findOne({
      orderId,
      userId: String(userId),
    });
    if (!payment || payment.paymentMethod !== "razorpay") {
      return sendError(res, req, 400, "No Razorpay payment for this order");
    }
    if (payment.status === "success") {
      return sendError(res, req, 400, "Payment already completed");
    }

    const nowMs = Date.now();
    const baseCooldownMs = appConfig.razorpayCreateOrderCooldownMs;
    const maxCooldownMs = appConfig.razorpayCreateOrderCooldownMaxMs;
    const maxAttemptsPerHour = appConfig.razorpayCreateOrderMaxAttemptsPerHour;
    const hourMs = 60 * 60 * 1000;
    const control = payment.razorpayCheckoutControl || {};
    let windowStartedAt = control.windowStartedAt
      ? new Date(control.windowStartedAt)
      : new Date(nowMs);
    let windowAttempts = Number(control.windowAttempts || 0);
    const cooldownUntilMs = control.cooldownUntil
      ? new Date(control.cooldownUntil).getTime()
      : 0;

    if (!Number.isFinite(windowStartedAt.getTime()) || nowMs - windowStartedAt.getTime() >= hourMs) {
      windowStartedAt = new Date(nowMs);
      windowAttempts = 0;
    }

    if (Number.isFinite(cooldownUntilMs) && nowMs < cooldownUntilMs) {
      return sendError(
        res,
        req,
        429,
        "Please wait before creating another payment session",
        {
          razorpayOrderId: payment.providerPaymentId,
          retryAfterSeconds: Math.ceil((cooldownUntilMs - nowMs) / 1000),
          attemptsInWindow: windowAttempts,
          maxAttemptsPerHour,
        }
      );
    }

    if (windowAttempts >= maxAttemptsPerHour) {
      const retryAtMs = windowStartedAt.getTime() + hourMs;
      return sendError(
        res,
        req,
        429,
        "Too many payment session attempts for this order. Please retry later.",
        {
          retryAfterSeconds: Math.max(1, Math.ceil((retryAtMs - nowMs) / 1000)),
          attemptsInWindow: windowAttempts,
          maxAttemptsPerHour,
        }
      );
    }

    const amountPaise = Math.round(Number(payment.amount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 1) {
      return sendError(res, req, 400, "Invalid payment amount");
    }

    const escrow = await getEscrowByOrderId(order._id);
    const rzOrder = await createRazorpayOrder({
      amountPaise,
      receipt: String(payment.orderNumber || "order").slice(0, 40),
      notes: {
        mongoOrderId: String(order._id),
        mongoPaymentId: String(payment._id),
        ...(escrow ? { escrowId: String(escrow._id) } : {}),
      },
    });

    windowAttempts += 1;
    const computedCooldownMs = Math.min(
      maxCooldownMs,
      baseCooldownMs * Math.pow(2, Math.max(0, windowAttempts - 1))
    );
    payment.providerPaymentId = rzOrder.id;
    payment.razorpayCheckoutControl = {
      windowStartedAt,
      windowAttempts,
      lastAttemptAt: new Date(nowMs),
      cooldownUntil: new Date(nowMs + computedCooldownMs),
    };
    await payment.save();

    sendSuccess(res, req, 200, {
      success: true,
      message: "Razorpay order created",
      keyId: getPublishableKeyId(),
      razorpayOrderId: rzOrder.id,
      amountPaise,
      currency: "INR",
      paymentId: payment._id,
      orderId: order._id,
      orderNumber: order.orderNumber,
      checkoutRetry: {
        attemptsInWindow: windowAttempts,
        maxAttemptsPerHour,
        cooldownSeconds: Math.ceil(computedCooldownMs / 1000),
      },
    });
  } catch (error) {
    console.error("createRazorpayCheckoutOrder:", error);
    sendError(res, req, 500, "Error creating Razorpay order", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/** Verify Razorpay Checkout callback (signature + API fetch). */
const verifyRazorpayPayment = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return sendError(res, req, 503, "Razorpay is not configured");
    }
    const userId = req.body.userId;
    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body;
    if (!userId) {
      return sendError(res, req, 401, "User not authenticated");
    }
    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return sendError(
        res,
        req,
        400,
        "orderId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required"
      );
    }

    const payment = await paymentModel.findOne({
      orderId,
      userId: String(userId),
    });
    if (!payment || payment.paymentMethod !== "razorpay") {
      return sendError(res, req, 404, "Payment not found");
    }

    if (payment.status === "success") {
      return sendSuccess(res, req, 200, {
        success: true,
        message: "Payment already verified",
        data: payment,
      });
    }

    if (payment.providerPaymentId && payment.providerPaymentId !== razorpayOrderId) {
      return sendError(res, req, 400, "Razorpay order id does not match this checkout session");
    }

    if (!verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return sendError(res, req, 401, "Invalid payment signature");
    }

    let rzPay;
    try {
      rzPay = await fetchRazorpayPayment(razorpayPaymentId);
    } catch (e) {
      console.error("fetchRazorpayPayment:", e);
      return sendError(res, req, 502, "Could not verify payment with Razorpay");
    }

    const expectedPaise = Math.round(Number(payment.amount) * 100);
    if (Number(rzPay.amount) !== expectedPaise) {
      return sendError(res, req, 400, "Payment amount mismatch");
    }
    if (String(rzPay.order_id || "") !== String(razorpayOrderId)) {
      return sendError(res, req, 400, "Razorpay order id mismatch");
    }
    if (!["captured", "authorized"].includes(String(rzPay.status))) {
      return sendError(res, req, 400, `Payment not successful (status: ${rzPay.status})`);
    }

    payment.status = "success";
    payment.transactionId = razorpayPaymentId;
    payment.providerPaymentId = razorpayOrderId;
    payment.paidAt = new Date();
    await payment.save();

    await ensureEscrowForOrder({
      orderId: payment.orderId,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency || "INR",
    });
    await onEscrowPaymentCaptured({
      orderId: payment.orderId,
      razorpayOrderId,
      razorpayPaymentId,
      actor: { kind: "user", id: String(userId) },
    });

    const order = await orderModel.findById(payment.orderId);
    if (order) {
      order.payment = {
        status: "paid",
        method: payment.paymentMethod,
        transactionId: razorpayPaymentId,
        paidAt: new Date(),
      };
      await order.save();
      if (order.status === "pending") {
        await transitionOrderById(order._id, "confirmed", {
          message: "Payment received",
          updatedBy: "system",
        });
      }
    }

    void sendPaymentReceiptEmailIfNeeded(payment._id).catch((e) =>
      console.error("payment receipt email:", e)
    );

    sendSuccess(res, req, 200, {
      success: true,
      message: "Payment verified",
      data: payment,
    });
  } catch (error) {
    console.error("verifyRazorpayPayment:", error);
    sendError(res, req, 500, "Error verifying payment", {
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export {
  createPayment,
  processPayment,
  getUserPayments,
  getPaymentById,
  getAllPayments,
  updatePaymentStatus,
  processRefund,
  adminCreatePayment,
  adminDeletePayment,
  getWalletBalance,
  getWalletLedger,
  createRazorpayCheckoutOrder,
  verifyRazorpayPayment,
  getPaymentReconciliationDaily,
  exportPaymentReconciliationDailyCsv,
  exportPaymentReconciliationIssuesCsv,
};

