import auditLogModel from "../models/auditLogModel.js";
import { getClientIp, getUserAgent } from "../utils/requestContext.js";

/**
 * Append-only security/finance audit trail (Air-Tasker pattern).
 */
export async function writeAudit(req, {
  userId = null,
  action,
  resourceType = "",
  resourceId = "",
  meta = null,
  ipAddress,
  userAgent,
} = {}) {
  if (!action) return null;
  try {
    return await auditLogModel.create({
      userId: userId || null,
      action: String(action),
      resourceType: String(resourceType || ""),
      resourceId: String(resourceId || ""),
      meta: meta ?? null,
      ipAddress: ipAddress ?? (req ? getClientIp(req) : ""),
      userAgent: userAgent ?? (req ? getUserAgent(req) : ""),
    });
  } catch (error) {
    console.error("writeAudit:", error);
    return null;
  }
}

export async function listAuditLogs({
  action,
  userId,
  resourceType,
  from,
  to,
  page = 1,
  limit = 20,
} = {}) {
  const filter = {};
  if (action) filter.action = String(action);
  if (userId) filter.userId = userId;
  if (resourceType) filter.resourceType = String(resourceType);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const skip = (safePage - 1) * safeLimit;

  const [rows, total] = await Promise.all([
    auditLogModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    auditLogModel.countDocuments(filter),
  ]);

  return { rows, total, page: safePage, limit: safeLimit };
}
