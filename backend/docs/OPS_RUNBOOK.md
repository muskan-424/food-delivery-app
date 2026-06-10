# Operations runbook (Phase Z)

## Dispute → refund

1. Customer opens dispute: `POST /api/disputes` (escrow → `DISPUTE_OPENED` when `ENABLE_ESCROW_PAYMENTS=true`).
2. Admin reviews: `GET /api/disputes/admin/all`, `PATCH /api/disputes/:id` with `financialOutcome: refund|release|none`.
3. Refund path triggers Razorpay refund via `disputeEscrowService` + payment record update.
4. Verify: `GET /api/admin/users/metrics/escrow`, payment reconciliation CSV.

## Payout retry (escrow)

1. Check block reason: `GET /api/admin/users/metrics/escrow` → `pipeline.awaitingPayout` / `staleReleaseEligible`.
2. If fraud-blocked: `POST /api/payment/razorpay/payout/override-fraud-block` with `orderId`, `reasonCode`, `note`.
3. Retry payout: `POST /api/payment/razorpay/payout/initiate-escrow` `{ orderId }` (admin).
4. Audit trail: `GET /api/admin/users/audit-logs?action=escrow.payout_fraud_blocked`.

## Webhook replay (Razorpay)

1. Razorpay Dashboard → Webhooks → failed event → Resend.
2. Or replay payload to `POST /api/payment/webhook` with valid `X-Razorpay-Signature`.
3. Idempotency: `paymentWebhookEvent` collection dedupes by `eventId`.
4. Drift check: `GET /api/admin/users/metrics/payments` → `reconciliation.webhookVsPaymentDrift`.

## Escrow + KYC security checklist

- [ ] `RAZORPAY_WEBHOOK_SECRET` set; signature verification enabled
- [ ] `KYC_WEBHOOK_SECRET` set when using Signzy
- [ ] `ENABLE_PAYOUT_FRAUD_RULES` on in production
- [ ] Admin routes require `adminMiddleware`
- [ ] CSRF on state-changing `/api/payment`, `/api/disputes`
- [ ] No secrets in client bundles (only Razorpay key_id publishable)

## Feature-flag rollout (escrow)

See `FEATURE_FLAG_ROLLOUT.md`.
