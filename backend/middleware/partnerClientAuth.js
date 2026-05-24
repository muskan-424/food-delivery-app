import jwt from "jsonwebtoken";
import { sendError } from "../utils/apiResponse.js";

function getPartnerJwtSecret() {
  return String(process.env.PARTNER_API_JWT_SECRET || process.env.JWT_SECRET || "").trim();
}

export const partnerClientAuth = (req, res, next) => {
  try {
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      req.partnerAuthOutcome = "missing_bearer";
      req.partnerErrorCode = "missing_bearer_token";
      return sendError(res, req, 401, "Missing bearer token");
    }
    const secret = getPartnerJwtSecret();
    if (!secret) {
      req.partnerAuthOutcome = "server_error";
      req.partnerErrorCode = "partner_secret_not_configured";
      return sendError(res, req, 500, "Partner auth secret is not configured");
    }
    const decoded = jwt.verify(token, secret);
    if (decoded?.kind !== "partner_client" || !decoded?.sub) {
      req.partnerAuthOutcome = "invalid_token";
      req.partnerErrorCode = "invalid_partner_token";
      return sendError(res, req, 401, "Invalid partner token");
    }
    req.partnerClient = {
      clientId: String(decoded.sub),
      scopes: Array.isArray(decoded.scopes) ? decoded.scopes : [],
      jti: decoded.jti || "",
      exp: decoded.exp || null,
    };
    req.partnerAuthOutcome = "ok";
    return next();
  } catch (error) {
    req.partnerAuthOutcome = "invalid_token";
    req.partnerErrorCode = "invalid_or_expired_token";
    return sendError(res, req, 401, "Invalid or expired partner token");
  }
};

export const requirePartnerScope = (scope) => (req, res, next) => {
  const wanted = String(scope || "").trim();
  if (!wanted) return next();
  const scopes = Array.isArray(req.partnerClient?.scopes) ? req.partnerClient.scopes : [];
  if (!scopes.includes(wanted)) {
    req.partnerAuthOutcome = "scope_denied";
    req.partnerErrorCode = "missing_scope";
    return sendError(res, req, 403, `Missing required scope: ${wanted}`);
  }
  return next();
};
