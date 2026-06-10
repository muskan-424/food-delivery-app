import mongoose from "mongoose";
import disputeModel from "../models/disputeModel.js";
import orderModel from "../models/orderModel.js";
import paymentModel from "../models/paymentModel.js";
import { getPaginationParams, buildPaginationMeta } from "../utils/pagination.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import {
  onDisputeOpened,
  onDisputeFinancialResolve,
  listDisputeEvents,
} from "../services/disputeEscrowService.js";
import { writeAudit } from "../services/auditService.js";

const DISPUTE_SLA_HOURS = {
  low: Number(process.env.DISPUTE_SLA_HOURS_LOW) > 0 ? Number(process.env.DISPUTE_SLA_HOURS_LOW) : 72,
  normal:
    Number(process.env.DISPUTE_SLA_HOURS_NORMAL) > 0
      ? Number(process.env.DISPUTE_SLA_HOURS_NORMAL)
      : 48,
  high: Number(process.env.DISPUTE_SLA_HOURS_HIGH) > 0 ? Number(process.env.DISPUTE_SLA_HOURS_HIGH) : 24,
};

const DISPUTE_TRANSITIONS = {
  open: ["in_review", "awaiting_customer", "resolved", "closed"],
  in_review: ["awaiting_customer", "resolved", "closed"],
  awaiting_customer: ["in_review", "resolved", "closed"],
  resolved: ["closed", "in_review"],
  closed: [],
};

function generateDisputeNumber() {
  const t = Date.now().toString().slice(-8);
  const r = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `DSP${t}${r}`;
}

function computeDisputeSla(doc, now = new Date()) {
  const priority = ["low", "normal", "high"].includes(doc?.priority) ? doc.priority : "normal";
  const slaHours = DISPUTE_SLA_HOURS[priority] || DISPUTE_SLA_HOURS.normal;
  const baseAt = doc?.createdAt ? new Date(doc.createdAt) : new Date();
  const dueAt = new Date(baseAt.getTime() + slaHours * 60 * 60 * 1000);
  const isTerminal = ["resolved", "closed"].includes(String(doc?.status || ""));
  const overdueMs = Math.max(0, now.getTime() - dueAt.getTime());
  const remainingMs = Math.max(0, dueAt.getTime() - now.getTime());
  return {
    priority,
    slaHours,
    dueAt,
    isTerminal,
    isOverdue: !isTerminal && overdueMs > 0,
    overdueMinutes: Math.floor(overdueMs / 60000),
    remainingMinutes: Math.floor(remainingMs / 60000),
  };
}

export const createDispute = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { orderId, category, subject, description, paymentId } = req.body;

    if (!orderId || !description || String(description).trim().length < 10) {
      return sendError(
        res,
        req,
        400,
        "orderId and description (min 10 characters) are required"
      );
    }

    const order = await orderModel.findById(orderId);
    if (!order) {
      return sendError(res, req, 404, "Order not found");
    }
    if (String(order.userId) !== String(userId)) {
      return sendError(res, req, 403, "You can only open a dispute for your own orders");
    }

    const active = await disputeModel.findOne({
      orderId: order._id,
      userId: String(userId),
      status: { $in: ["open", "in_review", "awaiting_customer"] },
    });
    if (active) {
      return sendError(res, req, 409, "An open dispute already exists for this order", {
        data: { disputeId: active._id, disputeNumber: active.disputeNumber },
      });
    }

    let linkedPaymentId = null;
    if (paymentId != null && String(paymentId).trim()) {
      if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return sendError(res, req, 400, "Invalid paymentId");
      }
      const pay = await paymentModel.findById(paymentId);
      if (!pay || String(pay.orderId) !== String(order._id)) {
        return sendError(res, req, 400, "paymentId must belong to this order");
      }
      if (String(pay.userId) !== String(userId)) {
        return sendError(res, req, 403, "Payment does not belong to you");
      }
      linkedPaymentId = pay._id;
    }

    const doc = await disputeModel.create({
      disputeNumber: generateDisputeNumber(),
      orderId: order._id,
      userId: String(userId),
      category: category || "other",
      subject: String(subject || "").slice(0, 200),
      description: String(description).slice(0, 8000),
      paymentId: linkedPaymentId,
      statusHistory: [
        {
          from: null,
          to: "open",
          actorType: "customer",
          actorId: String(userId),
          note: "Dispute created",
          createdAt: new Date(),
        },
      ],
    });

    await onDisputeOpened({
      disputeId: doc._id,
      orderId: order._id,
      actor: { kind: "customer", id: String(userId) },
    });

    sendSuccess(res, req, 201, {
      success: true,
      message: "Dispute created",
      data: doc,
    });
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, req, 409, "Could not allocate dispute number — please retry");
    }
    console.error("createDispute:", err);
    sendError(res, req, 500, "Error creating dispute");
  }
};

export const listMyDisputes = async (req, res) => {
  try {
    const userId = req.body.userId;
    const { skip, page: p, limit: lim } = getPaginationParams(req.query);

    const [rows, total] = await Promise.all([
      disputeModel
        .find({ userId: String(userId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .populate("orderId", "orderNumber status finalAmount createdAt")
        .lean(),
      disputeModel.countDocuments({ userId: String(userId) }),
    ]);

    sendSuccess(res, req, 200, {
      success: true,
      data: rows,
      pagination: buildPaginationMeta(total, p, lim),
    });
  } catch (err) {
    console.error("listMyDisputes:", err);
    sendError(res, req, 500, "Error listing disputes");
  }
};

export const adminListDisputes = async (req, res) => {
  try {
    const { status, sla } = req.query;
    const { skip, page: p, limit: lim } = getPaginationParams(req.query);
    const now = new Date();
    const allowedStatuses = ["open", "in_review", "awaiting_customer", "resolved", "closed"];
    const slaFilter = String(sla || "").trim().toLowerCase();
    if (status && !allowedStatuses.includes(String(status))) {
      return sendError(res, req, 400, "Invalid status filter");
    }
    if (slaFilter && !["overdue", "due_soon"].includes(slaFilter)) {
      return sendError(res, req, 400, "Invalid sla filter (allowed: overdue, due_soon)");
    }

    const q = {};
    if (status && typeof status === "string") {
      q.status = status;
    }

    const [rows, total] = await Promise.all([
      disputeModel
        .find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim)
        .populate("orderId", "orderNumber status finalAmount userId")
        .populate("paymentId", "status amount paymentMethod transactionId orderNumber")
        .lean(),
      disputeModel.countDocuments(q),
    ]);

    let data = rows.map((r) => ({ ...r, sla: computeDisputeSla(r, now) }));
    if (slaFilter === "overdue") {
      data = data.filter((r) => r.sla?.isOverdue);
    } else if (slaFilter === "due_soon") {
      data = data.filter(
        (r) => !r.sla?.isOverdue && !r.sla?.isTerminal && (r.sla?.remainingMinutes || 0) <= 12 * 60
      );
    }

    sendSuccess(res, req, 200, {
      success: true,
      data,
      pagination: buildPaginationMeta(slaFilter ? data.length : total, p, lim),
    });
  } catch (err) {
    console.error("adminListDisputes:", err);
    sendError(res, req, 500, "Error listing disputes");
  }
};

export const adminDisputeSummary = async (req, res) => {
  try {
    const now = new Date();
    const rows = await disputeModel
      .find({})
      .select("status priority createdAt resolvedAt closedAt")
      .lean();

    const byStatus = { open: 0, in_review: 0, awaiting_customer: 0, resolved: 0, closed: 0 };
    const byPriority = { low: 0, normal: 0, high: 0 };
    let overdue = 0;
    let dueSoon12h = 0;
    let terminal = 0;

    for (const row of rows) {
      const st = String(row.status || "");
      if (Object.prototype.hasOwnProperty.call(byStatus, st)) byStatus[st] += 1;
      const pr = ["low", "normal", "high"].includes(row.priority) ? row.priority : "normal";
      byPriority[pr] += 1;
      const sla = computeDisputeSla(row, now);
      if (sla.isTerminal) {
        terminal += 1;
      } else if (sla.isOverdue) {
        overdue += 1;
      } else if (sla.remainingMinutes <= 12 * 60) {
        dueSoon12h += 1;
      }
    }

    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        totals: {
          all: rows.length,
          active: rows.length - terminal,
          terminal,
          overdue,
          dueSoon12h,
        },
        byStatus,
        byPriority,
        slaHours: DISPUTE_SLA_HOURS,
        generatedAt: now.toISOString(),
      },
    });
  } catch (err) {
    console.error("adminDisputeSummary:", err);
    return sendError(res, req, 500, "Error loading dispute summary");
  }
};

export const getDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const userId = req.body.userId;
    const isAdmin = req.body.role === "admin";

    const doc = await disputeModel
      .findById(disputeId)
      .populate("orderId")
      .populate("paymentId");

    if (!doc) {
      return sendError(res, req, 404, "Dispute not found");
    }

    if (!isAdmin && String(doc.userId) !== String(userId)) {
      return sendError(res, req, 403, "Access denied");
    }

    const payload = doc.toObject();
    if (!isAdmin) {
      delete payload.internalNotes;
    } else {
      payload.disputeEvents = await listDisputeEvents(doc._id);
    }

    sendSuccess(res, req, 200, { success: true, data: payload });
  } catch (err) {
    console.error("getDispute:", err);
    sendError(res, req, 500, "Error loading dispute");
  }
};

export const adminUpdateDispute = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const adminId = req.body.userId;
    const {
      status,
      priority,
      resolution,
      internalNote,
      paymentId,
      financialOutcome,
      refundAmountInr,
    } = req.body;

    const doc = await disputeModel.findById(disputeId);
    if (!doc) {
      return sendError(res, req, 404, "Dispute not found");
    }

    const allowed = [
      "open",
      "in_review",
      "awaiting_customer",
      "resolved",
      "closed",
    ];
    if (status != null) {
      if (!allowed.includes(status)) {
        return sendError(res, req, 400, "Invalid dispute status");
      }
      if (status !== doc.status) {
        const canMove = (DISPUTE_TRANSITIONS[doc.status] || []).includes(status);
        if (!canMove) {
          return sendError(
            res,
            req,
            409,
            `Invalid status transition from ${doc.status} to ${status}`
          );
        }
        doc.statusHistory.push({
          from: doc.status,
          to: status,
          actorType: "admin",
          actorId: String(adminId),
          note: String(internalNote || "").slice(0, 4000),
          createdAt: new Date(),
        });
        doc.status = status;
      }
      if (status === "resolved" && !doc.resolvedAt) doc.resolvedAt = new Date();
      if (status === "closed" && !doc.closedAt) doc.closedAt = new Date();
    }

    if (priority && ["low", "normal", "high"].includes(priority)) {
      doc.priority = priority;
    }

    if (resolution != null) {
      doc.resolution = String(resolution).slice(0, 8000);
    }

    if (internalNote && String(internalNote).trim()) {
      doc.internalNotes.push({
        adminId,
        text: String(internalNote).slice(0, 4000),
        createdAt: new Date(),
      });
    }

    if (paymentId !== undefined) {
      const raw = paymentId == null || paymentId === "" ? null : String(paymentId).trim();
      if (!raw) {
        doc.paymentId = null;
      } else if (!mongoose.Types.ObjectId.isValid(raw)) {
        return sendError(res, req, 400, "Invalid paymentId");
      } else {
        const pay = await paymentModel.findById(raw);
        if (!pay || String(pay.orderId) !== String(doc.orderId)) {
          return sendError(
            res,
            req,
            400,
            "paymentId must reference a payment for this dispute's order"
          );
        }
        doc.paymentId = pay._id;
      }
    }

    if (financialOutcome != null) {
      const fo = String(financialOutcome || "none").toLowerCase();
      if (!["none", "release", "refund", ""].includes(fo)) {
        return sendError(res, req, 400, "financialOutcome must be none, release, or refund");
      }
      if (fo) doc.financialOutcome = fo;
    }
    if (refundAmountInr != null) {
      const amt = Number(refundAmountInr);
      if (Number.isFinite(amt) && amt >= 0) doc.refundAmountInr = amt;
    }

    await doc.save();

    if (status === "resolved" && doc.financialOutcome && doc.financialOutcome !== "none") {
      const moneyResult = await onDisputeFinancialResolve({
        disputeId: doc._id,
        orderId: doc.orderId,
        financialOutcome: doc.financialOutcome,
        refundAmountInr: doc.refundAmountInr,
        actor: { kind: "admin", id: String(adminId) },
      });
      await writeAudit(req, {
        userId: adminId,
        action: "dispute.financial_resolve",
        resourceType: "dispute",
        resourceId: String(doc._id),
        meta: { financialOutcome: doc.financialOutcome, moneyResult },
      });
    }

    const events = await listDisputeEvents(doc._id);

    sendSuccess(res, req, 200, {
      success: true,
      message: "Dispute updated",
      data: { ...doc.toObject(), disputeEvents: events },
    });
  } catch (err) {
    console.error("adminUpdateDispute:", err);
    sendError(res, req, 500, "Error updating dispute");
  }
};

export const addCustomerDisputeReply = async (req, res) => {
  try {
    const { disputeId } = req.params;
    const userId = req.body.userId;
    const text = String(req.body.text || "").trim();

    if (!text || text.length < 5) {
      return sendError(res, req, 400, "Reply text must be at least 5 characters");
    }

    const doc = await disputeModel.findById(disputeId);
    if (!doc) {
      return sendError(res, req, 404, "Dispute not found");
    }
    if (String(doc.userId) !== String(userId)) {
      return sendError(res, req, 403, "Access denied");
    }
    if (["resolved", "closed"].includes(doc.status)) {
      return sendError(res, req, 409, "Cannot reply to resolved/closed dispute");
    }

    doc.customerReplies.push({
      text: text.slice(0, 4000),
      createdAt: new Date(),
    });

    if (doc.status === "awaiting_customer") {
      doc.statusHistory.push({
        from: "awaiting_customer",
        to: "in_review",
        actorType: "customer",
        actorId: String(userId),
        note: "Customer replied",
        createdAt: new Date(),
      });
      doc.status = "in_review";
    }

    await doc.save();
    sendSuccess(res, req, 200, { success: true, message: "Reply submitted", data: doc });
  } catch (err) {
    console.error("addCustomerDisputeReply:", err);
    sendError(res, req, 500, "Error submitting dispute reply");
  }
};
