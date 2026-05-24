import crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import partnerApiClientModel from "../models/partnerApiClientModel.js";
import { sendError, sendSuccess } from "../utils/apiResponse.js";

export const PARTNER_API_SCOPE_CATALOG = [
  { key: "orders.read", description: "Read order payloads for external partner sync" },
  { key: "orders.write", description: "Create/update partner-driven order status events" },
];

function normalizeScopes(input) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 30);
}

export function normalizeAllowedPartnerScopes(input) {
  const allowed = new Set(PARTNER_API_SCOPE_CATALOG.map((s) => s.key));
  return normalizeScopes(input).filter((s) => allowed.has(s));
}

export function splitPartnerScopesByCatalog(input) {
  const allowed = new Set(PARTNER_API_SCOPE_CATALOG.map((s) => s.key));
  const unique = normalizeScopes(input);
  return {
    valid: unique.filter((s) => allowed.has(s)),
    invalid: unique.filter((s) => !allowed.has(s)),
  };
}

function getPartnerJwtSecret() {
  return String(process.env.PARTNER_API_JWT_SECRET || process.env.JWT_SECRET || "").trim();
}

function getTokenTtlSec() {
  const v = Number(process.env.PARTNER_API_TOKEN_TTL_SEC);
  if (!Number.isFinite(v) || v < 60) return 3600;
  return Math.min(86400, Math.floor(v));
}

export const issuePartnerAccessToken = async (req, res) => {
  try {
    req.partnerAuditClientId = String(req.body.client_id || req.body.clientId || "").trim();
    const grantType = String(req.body.grant_type || req.body.grantType || "").trim();
    if (grantType !== "client_credentials") {
      req.partnerAuthOutcome = "invalid_grant";
      req.partnerErrorCode = "invalid_grant_type";
      return sendError(res, req, 400, "grant_type must be client_credentials");
    }
    const clientId = String(req.body.client_id || req.body.clientId || "").trim();
    const clientSecret = String(req.body.client_secret || req.body.clientSecret || "").trim();
    if (!clientId || !clientSecret) {
      req.partnerAuthOutcome = "invalid_request";
      req.partnerErrorCode = "missing_client_credentials";
      return sendError(res, req, 400, "client_id and client_secret are required");
    }
    const client = await partnerApiClientModel.findOne({ clientId });
    if (!client || !client.active) {
      req.partnerAuthOutcome = "invalid_client";
      req.partnerErrorCode = "client_not_found_or_inactive";
      return sendError(res, req, 401, "Invalid client credentials");
    }
    const ok = await bcrypt.compare(clientSecret, client.secretHash);
    if (!ok) {
      req.partnerAuthOutcome = "invalid_client";
      req.partnerErrorCode = "client_secret_mismatch";
      return sendError(res, req, 401, "Invalid client credentials");
    }

    const requestedScopeTokens = normalizeScopes(
      String(req.body.scope || "")
        .split(" ")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    const { valid: requestedScopes, invalid: invalidRequestedScopes } =
      splitPartnerScopesByCatalog(requestedScopeTokens);
    if (invalidRequestedScopes.length > 0) {
      req.partnerAuthOutcome = "invalid_scope";
      req.partnerErrorCode = "unknown_scope";
      return sendError(res, req, 400, "invalid_scope", {
        invalidScopes: invalidRequestedScopes,
      });
    }
    const allowed = normalizeScopes(client.scopes || []);
    const unauthorizedRequestedScopes = requestedScopes.filter(
      (s) => !allowed.includes(s)
    );
    if (unauthorizedRequestedScopes.length > 0) {
      req.partnerAuthOutcome = "invalid_scope";
      req.partnerErrorCode = "unauthorized_scope";
      return sendError(
        res,
        req,
        400,
        "invalid_scope",
        { unauthorizedScopes: unauthorizedRequestedScopes }
      );
    }
    const scopes =
      requestedScopes.length > 0
        ? requestedScopes
        : allowed;
    const secret = getPartnerJwtSecret();
    if (!secret) {
      req.partnerAuthOutcome = "server_error";
      req.partnerErrorCode = "partner_secret_not_configured";
      return sendError(res, req, 500, "Partner auth secret is not configured");
    }
    const ttlSec = getTokenTtlSec();
    const token = jwt.sign(
      {
        kind: "partner_client",
        scopes,
      },
      secret,
      {
        subject: client.clientId,
        audience: "partner-api",
        issuer: "food-delivery-backend",
        expiresIn: ttlSec,
        jwtid: crypto.randomUUID(),
      }
    );
    client.lastUsedAt = new Date();
    await client.save();
    req.partnerAuthOutcome = "issued";
    return sendSuccess(res, req, 200, {
      access_token: token,
      token_type: "Bearer",
      expires_in: ttlSec,
      scope: scopes.join(" "),
    });
  } catch (error) {
    req.partnerAuthOutcome = "server_error";
    req.partnerErrorCode = "token_issue_failed";
    console.error("issuePartnerAccessToken:", error);
    return sendError(res, req, 500, "Error issuing partner token");
  }
};

export const getPartnerMe = async (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    data: {
      clientId: req.partnerClient?.clientId || "",
      scopes: req.partnerClient?.scopes || [],
      tokenExp: req.partnerClient?.exp || null,
    },
  });
};

export const partnerOrdersPing = async (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    message: "Partner orders scope verified",
    data: {
      clientId: req.partnerClient?.clientId || "",
      receivedAt: new Date().toISOString(),
    },
  });
};

export const getPartnerScopeCatalog = async (req, res) => {
  return sendSuccess(res, req, 200, {
    success: true,
    data: {
      scopes: PARTNER_API_SCOPE_CATALOG,
    },
  });
};
