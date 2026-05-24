import crypto from "crypto";
import groupOrderSessionModel from "../models/groupOrderSessionModel.js";
import groupSplitPaymentModel from "../models/groupSplitPaymentModel.js";
import userModel from "../models/userModel.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

function buildInviteCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function toSessionView(session) {
  const s = session?.toObject ? session.toObject() : session;
  return {
    _id: s?._id,
    inviteCode: s?.inviteCode || "",
    leaderUserId: s?.leaderUserId || "",
    restaurantId: s?.restaurantId || null,
    status: s?.status || "open",
    members: Array.isArray(s?.members) ? s.members : [],
    memberCount: Array.isArray(s?.members) ? s.members.length : 0,
    orderId: s?.orderId || null,
    splitPlan: s?.splitPlan || null,
    createdAt: s?.createdAt || null,
    updatedAt: s?.updatedAt || null,
  };
}

async function ensureUserName(userId) {
  const user = await userModel.findById(userId).select("name");
  return String(user?.name || "Member");
}

const createGroupOrderSession = async (req, res) => {
  try {
    const leaderUserId = String(req.body.userId || "").trim();
    if (!leaderUserId) return sendError(res, req, 401, "Authentication required");
    const restaurantId = req.body.restaurantId || null;
    const leaderName = await ensureUserName(leaderUserId);
    let inviteCode = buildInviteCode();
    for (let i = 0; i < 3; i += 1) {
      const exists = await groupOrderSessionModel.exists({ inviteCode });
      if (!exists) break;
      inviteCode = buildInviteCode();
    }
    const doc = await groupOrderSessionModel.create({
      inviteCode,
      leaderUserId,
      restaurantId,
      status: "open",
      members: [{ userId: leaderUserId, name: leaderName }],
    });
    return sendSuccess(res, req, 201, {
      success: true,
      message: "Group order session created",
      data: toSessionView(doc),
    });
  } catch (error) {
    console.error("createGroupOrderSession:", error);
    return sendError(res, req, 500, "Error creating group order session");
  }
};

const joinGroupOrderSession = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const inviteCode = String(req.body.inviteCode || "").trim().toUpperCase();
    if (!userId || !inviteCode) return sendError(res, req, 400, "inviteCode is required");
    const row = await groupOrderSessionModel.findOne({ inviteCode });
    if (!row) return sendError(res, req, 404, "Group session not found");
    if (row.status !== "open") return sendError(res, req, 400, "Group session is not open");
    if (!row.members.some((m) => String(m.userId) === userId)) {
      const name = await ensureUserName(userId);
      row.members.push({ userId, name, joinedAt: new Date() });
      await row.save();
    }
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Joined group session",
      data: toSessionView(row),
    });
  } catch (error) {
    console.error("joinGroupOrderSession:", error);
    return sendError(res, req, 500, "Error joining group order session");
  }
};

const leaveGroupOrderSession = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId);
    if (!row) return sendError(res, req, 404, "Group session not found");
    if (row.status !== "open") return sendError(res, req, 400, "Group session is not open");
    if (String(row.leaderUserId) === userId) {
      return sendError(res, req, 400, "Leader cannot leave. Close session instead.");
    }
    row.members = (row.members || []).filter((m) => String(m.userId) !== userId);
    await row.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Left group session",
      data: toSessionView(row),
    });
  } catch (error) {
    console.error("leaveGroupOrderSession:", error);
    return sendError(res, req, 500, "Error leaving group order session");
  }
};

const getGroupOrderSession = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId).lean();
    if (!row) return sendError(res, req, 404, "Group session not found");
    const isMember = (row.members || []).some((m) => String(m.userId) === userId);
    if (!isMember) return sendError(res, req, 403, "Not allowed");
    return sendSuccess(res, req, 200, { success: true, data: toSessionView(row) });
  } catch (error) {
    console.error("getGroupOrderSession:", error);
    return sendError(res, req, 500, "Error loading group session");
  }
};

const listMyGroupOrderSessions = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const rows = await groupOrderSessionModel
      .find({ "members.userId": userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    return sendSuccess(res, req, 200, {
      success: true,
      data: rows.map((r) => toSessionView(r)),
    });
  } catch (error) {
    console.error("listMyGroupOrderSessions:", error);
    return sendError(res, req, 500, "Error listing group sessions");
  }
};

const setGroupSplitPlan = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const totalAmount = Number(req.body.totalAmount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return sendError(res, req, 400, "totalAmount must be greater than 0");
    }
    const row = await groupOrderSessionModel.findById(sessionId);
    if (!row) return sendError(res, req, 404, "Group session not found");
    if (String(row.leaderUserId) !== userId) {
      return sendError(res, req, 403, "Only group leader can set split plan");
    }
    if (row.status !== "open") return sendError(res, req, 400, "Group session is not open");
    const members = Array.isArray(row.members) ? row.members : [];
    if (members.length === 0) return sendError(res, req, 400, "No members in session");
    const roundedTotal = Math.round(totalAmount * 100) / 100;
    const base = Math.floor((roundedTotal / members.length) * 100) / 100;
    let remaining = Math.round((roundedTotal - base * members.length) * 100) / 100;
    const shares = members.map((m, idx) => {
      let amount = base;
      if (remaining > 0 && idx === members.length - 1) {
        amount = Math.round((amount + remaining) * 100) / 100;
        remaining = 0;
      }
      return { userId: String(m.userId), amount };
    });
    row.splitPlan = {
      mode: "equal",
      totalAmount: roundedTotal,
      currency: "INR",
      shares,
      updatedAt: new Date(),
    };
    await row.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Split plan updated",
      data: row.splitPlan,
    });
  } catch (error) {
    console.error("setGroupSplitPlan:", error);
    return sendError(res, req, 500, "Error setting split plan");
  }
};

const closeGroupOrderSession = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId);
    if (!row) return sendError(res, req, 404, "Group session not found");
    if (String(row.leaderUserId) !== userId) {
      return sendError(res, req, 403, "Only group leader can close session");
    }
    row.status = "closed";
    row.closedAt = new Date();
    await row.save();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Group session closed",
      data: toSessionView(row),
    });
  } catch (error) {
    console.error("closeGroupOrderSession:", error);
    return sendError(res, req, 500, "Error closing group session");
  }
};

const getMyGroupSplitShare = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId).lean();
    if (!row) return sendError(res, req, 404, "Group session not found");
    const isMember = (row.members || []).some((m) => String(m.userId) === userId);
    if (!isMember) return sendError(res, req, 403, "Not allowed");
    const shareRow = (row.splitPlan?.shares || []).find(
      (x) => String(x.userId) === userId
    );
    const amount = Number(shareRow?.amount || 0);
    const splitPayment = await groupSplitPaymentModel
      .findOne({ sessionId: row._id, userId })
      .lean();
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        sessionId: String(row._id),
        inviteCode: String(row.inviteCode || ""),
        splitMode: String(row.splitPlan?.mode || "equal"),
        totalAmount: Number(row.splitPlan?.totalAmount || 0),
        currency: String(row.splitPlan?.currency || "INR"),
        myShareAmount: amount,
        paymentStatus:
          amount <= 0 ? "not_required" : String(splitPayment?.status || "pending"),
        paymentTransactionId: String(splitPayment?.transactionId || ""),
        paymentUpdatedAt: splitPayment?.updatedAt || null,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("getMyGroupSplitShare:", error);
    return sendError(res, req, 500, "Error loading split share");
  }
};

const initializeGroupSplitPayments = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId).lean();
    if (!row) return sendError(res, req, 404, "Group session not found");
    if (String(row.leaderUserId) !== userId) {
      return sendError(res, req, 403, "Only group leader can initialize split payments");
    }
    if (!Array.isArray(row.splitPlan?.shares) || row.splitPlan.shares.length === 0) {
      return sendError(res, req, 400, "Split plan is not configured");
    }
    const ops = row.splitPlan.shares.map((s) => ({
      updateOne: {
        filter: { sessionId: row._id, userId: String(s.userId) },
        update: {
          $setOnInsert: {
            sessionId: row._id,
            userId: String(s.userId),
            amount: Number(s.amount || 0),
            currency: String(row.splitPlan?.currency || "INR"),
            status: Number(s.amount || 0) > 0 ? "pending" : "cancelled",
          },
        },
        upsert: true,
      },
    }));
    if (ops.length > 0) {
      await groupSplitPaymentModel.bulkWrite(ops, { ordered: false });
    }
    const rows = await groupSplitPaymentModel.find({ sessionId: row._id }).lean();
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Split payment records initialized",
      data: rows,
    });
  } catch (error) {
    console.error("initializeGroupSplitPayments:", error);
    return sendError(res, req, 500, "Error initializing split payments");
  }
};

const markMyGroupSplitPaid = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId).lean();
    if (!row) return sendError(res, req, 404, "Group session not found");
    const isMember = (row.members || []).some((m) => String(m.userId) === userId);
    if (!isMember) return sendError(res, req, 403, "Not allowed");
    const shareRow = (row.splitPlan?.shares || []).find((x) => String(x.userId) === userId);
    const amount = Number(shareRow?.amount || 0);
    if (amount <= 0) {
      return sendError(res, req, 400, "No payable share amount");
    }
    const transactionId = String(req.body.transactionId || "").trim() || `GSP_${Date.now()}`;
    const payment = await groupSplitPaymentModel.findOneAndUpdate(
      { sessionId: row._id, userId },
      {
        $set: {
          amount,
          currency: String(row.splitPlan?.currency || "INR"),
          status: "paid",
          transactionId,
          paidAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );
    return sendSuccess(res, req, 200, {
      success: true,
      message: "Share marked as paid",
      data: payment,
    });
  } catch (error) {
    console.error("markMyGroupSplitPaid:", error);
    return sendError(res, req, 500, "Error marking share as paid");
  }
};

const getGroupSplitPaymentsSummary = async (req, res) => {
  try {
    const userId = String(req.body.userId || "").trim();
    const { sessionId } = req.params;
    const row = await groupOrderSessionModel.findById(sessionId).lean();
    if (!row) return sendError(res, req, 404, "Group session not found");
    const isMember = (row.members || []).some((m) => String(m.userId) === userId);
    if (!isMember) return sendError(res, req, 403, "Not allowed");

    const payments = await groupSplitPaymentModel
      .find({ sessionId: row._id })
      .sort({ createdAt: 1 })
      .lean();
    const byUser = new Map(payments.map((p) => [String(p.userId), p]));
    const members = Array.isArray(row.members) ? row.members : [];
    const shares = Array.isArray(row.splitPlan?.shares) ? row.splitPlan.shares : [];
    const rows = members.map((m) => {
      const uid = String(m.userId);
      const share = shares.find((s) => String(s.userId) === uid);
      const payment = byUser.get(uid);
      return {
        userId: uid,
        name: m.name || "",
        amount: Number(share?.amount || payment?.amount || 0),
        status: String(payment?.status || "pending"),
        paidAt: payment?.paidAt || null,
        transactionId: String(payment?.transactionId || ""),
      };
    });
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const paidAmount = rows
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const pendingCount = rows.filter((r) => r.status !== "paid" && Number(r.amount || 0) > 0).length;
    const paidCount = rows.filter((r) => r.status === "paid").length;
    return sendSuccess(res, req, 200, {
      success: true,
      data: {
        sessionId: String(row._id),
        currency: String(row.splitPlan?.currency || "INR"),
        totalAmount: Math.round(totalAmount * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
        paidCount,
        pendingCount,
        allPaid: pendingCount === 0 && totalAmount > 0,
        rows,
        computedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("getGroupSplitPaymentsSummary:", error);
    return sendError(res, req, 500, "Error loading split payment summary");
  }
};

export {
  createGroupOrderSession,
  joinGroupOrderSession,
  leaveGroupOrderSession,
  getGroupOrderSession,
  listMyGroupOrderSessions,
  setGroupSplitPlan,
  closeGroupOrderSession,
  getMyGroupSplitShare,
  initializeGroupSplitPayments,
  markMyGroupSplitPaid,
  getGroupSplitPaymentsSummary,
};
