import {
  registerUserPayoutBank,
  getUserPayoutStatus,
  initiateEscrowPayoutByOrderId,
} from "../services/escrowPayoutService.js";
import { setEscrowPayoutFraudOverride } from "../services/payoutFraudRulesService.js";
import { writeAudit } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { appConfig } from "../config/appConfig.js";

export const registerRazorpayPayoutBank = async (req, res) => {
  try {
    if (!appConfig.enableRazorpayxPayouts) {
      return sendError(res, req, 503, "RazorpayX payouts are disabled");
    }

    const userId = req.body.userId;
    const { beneficiaryName, ifsc, accountNumber } = req.body;
    if (!beneficiaryName || !ifsc || !accountNumber) {
      return sendError(res, req, 400, "beneficiaryName, ifsc, and accountNumber are required");
    }

    let result;
    try {
      result = await registerUserPayoutBank({
        userId,
        beneficiaryName,
        ifsc,
        accountNumber,
      });
    } catch (e) {
      const map = {
        user_not_found: [404, "User not found"],
        kyc_required: [403, e.message || "KYC verification required"],
        invalid_ifsc: [400, "Invalid IFSC code"],
        invalid_account: [400, "Invalid bank account number"],
        invalid_beneficiary: [400, "Invalid beneficiary name"],
        razorpayx_not_configured: [
          503,
          "RazorpayX not configured. Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PAYOUT_ACCOUNT_NUMBER",
        ],
      };
      const entry = map[e.message];
      if (entry) return sendError(res, req, entry[0], entry[1]);
      throw e;
    }

    await writeAudit(req, {
      userId,
      action: "payout.bank_registered",
      resourceType: "user",
      resourceId: String(userId),
      meta: { fundAccountId: result.fundAccountId, ifsc: result.bank?.ifsc },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Bank account registered for payouts",
      data: result,
    });
  } catch (error) {
    console.error("registerRazorpayPayoutBank:", error);
    return sendError(res, req, 500, "Error registering bank account");
  }
};

export const getRazorpayPayoutStatus = async (req, res) => {
  try {
    const userId = req.body.userId;
    const status = await getUserPayoutStatus(userId);
    if (!status) return sendError(res, req, 404, "User not found");
    return sendSuccess(res, req, 200, { success: true, data: status });
  } catch (error) {
    console.error("getRazorpayPayoutStatus:", error);
    return sendError(res, req, 500, "Error loading payout status");
  }
};

export const adminOverrideEscrowPayoutFraud = async (req, res) => {
  try {
    const { orderId, reasonCode, note } = req.body;
    if (!orderId) return sendError(res, req, 400, "orderId is required");
    if (!reasonCode || String(reasonCode).trim().length < 2) {
      return sendError(res, req, 400, "reasonCode is required (min 2 chars)");
    }

    const outcome = await setEscrowPayoutFraudOverride(orderId, {
      adminUserId: String(req.body.userId || ""),
      reasonCode,
      note,
    });

    if (!outcome.ok) {
      return sendError(res, req, 404, outcome.code || "Escrow not found");
    }

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Payout fraud override recorded — retry payout initiation",
      data: {
        orderId: String(orderId),
        payoutFraudOverride: outcome.escrow.payoutFraudOverride,
      },
    });
  } catch (error) {
    console.error("adminOverrideEscrowPayoutFraud:", error);
    return sendError(res, req, 500, "Error recording payout fraud override");
  }
};

export const adminInitiateEscrowPayout = async (req, res) => {
  try {
    if (!appConfig.enableEscrowPayments) {
      return sendError(res, req, 503, "Escrow payments are disabled");
    }
    const { orderId } = req.body;
    if (!orderId) return sendError(res, req, 400, "orderId is required");

    const outcome = await initiateEscrowPayoutByOrderId(orderId, {
      actor: { kind: "admin", id: String(req.body.userId || "") },
    });

    if (!outcome.ok) {
      return sendError(res, req, 404, outcome.code || "Unable to initiate payout");
    }

    await writeAudit(req, {
      userId: req.body.userId,
      action: "escrow.payout_initiated",
      resourceType: "order",
      resourceId: String(orderId),
      meta: { result: outcome.result?.status },
    });

    return sendSuccess(res, req, 200, {
      success: true,
      message: "Escrow payout initiation attempted",
      data: outcome,
    });
  } catch (error) {
    console.error("adminInitiateEscrowPayout:", error);
    return sendError(res, req, 500, "Error initiating escrow payout");
  }
};
