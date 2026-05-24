/**
 * Consistent JSON envelopes (Phase 0). Existing clients rely on success + message.
 */

function withRequestId(req, obj) {
  if (req?.requestId) {
    return { ...obj, requestId: req.requestId };
  }
  return obj;
}

export function sendSuccess(res, req, status, body) {
  res.status(status).json(withRequestId(req, body));
}

export function sendError(res, req, status, message, extra = {}) {
  res.status(status).json(
    withRequestId(req, {
      success: false,
      message,
      ...extra,
    })
  );
}

export function sendValidationError(res, req, errors) {
  sendError(res, req, 400, "Validation failed", { errors });
}
