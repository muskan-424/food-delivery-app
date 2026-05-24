import partnerApiAuditModel from "../models/partnerApiAuditModel.js";

function normalizeIp(ip) {
  return String(ip || "").trim().slice(0, 80);
}

export const partnerApiAuditMiddleware = (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", async () => {
    try {
      const endpoint = String(req.path || "").slice(0, 160);
      const method = String(req.method || "").toUpperCase().slice(0, 16);
      const clientId = String(
        req.partnerClient?.clientId ||
          req.partnerAuditClientId ||
          req.body?.client_id ||
          req.body?.clientId ||
          ""
      )
        .trim()
        .slice(0, 120);
      const authOutcome = String(req.partnerAuthOutcome || "").trim().slice(0, 60);
      const errorCode = String(req.partnerErrorCode || "").trim().slice(0, 80);
      await partnerApiAuditModel.create({
        clientId,
        endpoint,
        method,
        statusCode: Number(res.statusCode) || 0,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId: String(req.requestId || ""),
        ip: normalizeIp(
          req.headers["x-forwarded-for"] || req.socket?.remoteAddress || req.ip || ""
        ),
        authOutcome,
        errorCode,
      });
    } catch {}
  });
  next();
};
