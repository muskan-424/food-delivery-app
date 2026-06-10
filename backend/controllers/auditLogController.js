import { listAuditLogs } from "../services/auditService.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { buildPaginationMeta } from "../utils/pagination.js";

export const getAdminAuditLogs = async (req, res) => {
  try {
    const { action, userId, resourceType, from, to, page, limit } = req.query;
    const result = await listAuditLogs({
      action,
      userId,
      resourceType,
      from,
      to,
      page,
      limit,
    });
    return sendSuccess(res, req, 200, {
      success: true,
      data: result.rows,
      pagination: buildPaginationMeta(result.total, result.page, result.limit),
    });
  } catch (error) {
    console.error("getAdminAuditLogs:", error);
    return sendError(res, req, 500, "Error fetching audit logs");
  }
};
