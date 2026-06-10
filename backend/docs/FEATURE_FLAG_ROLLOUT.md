# Feature-flag rollout plan — escrow & payouts (Phase Z)

## Stage 0 — Off (default prod)

```
ENABLE_ESCROW_PAYMENTS=false
ENABLE_RAZORPAYX_PAYOUTS=false
```

Standard Razorpay checkout; no hold/release.

## Stage 1 — Internal staging

```
ENABLE_ESCROW_PAYMENTS=true
ENABLE_RAZORPAYX_PAYOUTS=true
KYC_STUB_AUTO_VERIFY=true
```

Run full E2E: `RUN_E2E_MONEY_LOOP=true npm run e2e:money-loop`

## Stage 2 — Internal users (10%)

- Enable for test restaurant accounts only
- Monitor `GET /api/health/ops` → `opsMetrics.escrow`
- Watch `PAYOUT_FAILED` escrow events

## Stage 3 — Beta (50%)

- `ENABLE_PAYOUT_FRAUD_RULES=true`
- Admin on-call for `payout/override-fraud-block`

## Stage 4 — General availability

- Remove `KYC_STUB_AUTO_VERIFY`
- Production Signzy + RazorpayX live accounts
- Reconciliation CSV daily export scheduled

## Rollback

Set `ENABLE_ESCROW_PAYMENTS=false` — new orders skip escrow; in-flight escrows handled per runbook.
