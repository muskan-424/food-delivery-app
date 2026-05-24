import { randomUUID } from "crypto";

/**
 * Sets req.requestId and echoes X-Request-Id for tracing (Phase 0).
 */
export function requestIdMiddleware(req, res, next) {
  const id =
    typeof req.get === "function" && req.get("X-Request-Id")
      ? String(req.get("X-Request-Id")).slice(0, 128)
      : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  next();
}
