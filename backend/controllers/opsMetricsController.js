import {
  getEscrowMetricsSummary,
  getPaymentOpsMetricsSummary,
} from "../services/opsMetricsService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const getEscrowMetricsAdmin = async (req, res) => {
  try {
    const data = await getEscrowMetricsSummary();
    return sendSuccess(res, req, 200, { success: true, data });
  } catch (error) {
    console.error("getEscrowMetricsAdmin:", error);
    return sendError(res, req, 500, "Error loading escrow metrics");
  }
};

export const getPaymentOpsMetricsAdmin = async (req, res) => {
  try {
    const data = await getPaymentOpsMetricsSummary();
    return sendSuccess(res, req, 200, { success: true, data });
  } catch (error) {
    console.error("getPaymentOpsMetricsAdmin:", error);
    return sendError(res, req, 500, "Error loading payment ops metrics");
  }
};
