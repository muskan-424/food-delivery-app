/**
 * Map Stripe / Razorpay webhook JSON into the generic shape expected by paymentWebhookSyncService.
 * Returns null if the body is already generic or cannot be normalized.
 */

export function normalizeStripeWebhookBody(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.eventId === "string" && typeof body.status === "string") {
    return null;
  }

  const eventId = body.id;
  const type = body.type;
  if (typeof eventId !== "string" || typeof type !== "string") {
    return null;
  }

  let status;
  if (
    type === "payment_intent.succeeded" ||
    type === "charge.succeeded" ||
    type === "checkout.session.completed"
  ) {
    status = "success";
  } else if (type === "payment_intent.payment_failed" || type === "charge.failed") {
    status = "failed";
  } else if (type === "payment_intent.canceled") {
    status = "cancelled";
  } else {
    return null;
  }

  const obj = body.data?.object;
  let providerPaymentId = typeof obj?.id === "string" ? obj.id : body.providerPaymentId;
  if (type === "checkout.session.completed" && obj) {
    const pi = obj.payment_intent;
    if (typeof pi === "string") {
      providerPaymentId = pi;
    } else if (pi && typeof pi === "object" && typeof pi.id === "string") {
      providerPaymentId = pi.id;
    }
  }
  const transactionId =
    (typeof obj?.payment_intent === "string" ? obj.payment_intent : null) ||
    (typeof obj?.id === "string" ? obj.id : null) ||
    undefined;

  return {
    eventId,
    status,
    providerPaymentId,
    paymentId: body.paymentId,
    transactionId,
  };
}

export function normalizeRazorpayWebhookBody(body) {
  if (!body || typeof body !== "object") return null;
  if (typeof body.eventId === "string" && typeof body.status === "string") {
    return null;
  }

  const event = body.event;
  if (typeof event !== "string") return null;

  const entity =
    body.payload?.payment?.entity ||
    body.payload?.order?.entity ||
    body.payload?.payment_link?.entity;

  const eventId =
    typeof body.id === "string"
      ? body.id
      : `${event}_${entity?.id || "unknown"}`;

  let status;
  if (event === "payment.captured" || event === "payment.authorized") {
    status = "success";
  } else if (event === "payment.failed") {
    status = "failed";
  } else {
    return null;
  }

  const providerPaymentId = entity?.id;
  const transactionId = entity?.id;

  return {
    eventId: String(eventId).slice(0, 256),
    status,
    providerPaymentId,
    paymentId: body.paymentId,
    transactionId,
  };
}
