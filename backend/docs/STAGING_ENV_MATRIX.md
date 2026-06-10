# Staging environment matrix (Phase Z)

| Variable | Staging | Required for | Notes |
|----------|---------|--------------|-------|
| `MONGO_URL` | ✅ | All | Run `npm run migrate:up` after deploy |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ✅ | Auth | Unique per environment |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | ✅ | Checkout | Test mode keys |
| `RAZORPAY_WEBHOOK_SECRET` | ✅ | Webhooks | Point to staging `/api/payment/webhook` |
| `RAZORPAY_PAYOUT_ACCOUNT_NUMBER` | ✅ | RazorpayX | Payout source account |
| `ENABLE_ESCROW_PAYMENTS` | ✅ | Money loop | `true` in staging |
| `ENABLE_RAZORPAYX_PAYOUTS` | ✅ | Auto payout | `true` when testing release |
| `ENABLE_USER_KYC` | ✅ | Payout gate | `true` + `KYC_STUB_AUTO_VERIFY=true` for dev |
| `KYC_WEBHOOK_SECRET` | Optional | Signzy path | If `KYC_PROVIDER=signzy` |
| `REDIS_URL` | Recommended | Queue, WS scale | BullMQ + Socket.IO adapter |
| `ENABLE_JOB_QUEUE` | Recommended | Notifications | `true` with Redis |
| `GEMINI_API_KEY` | Optional | AI agent / drafts | `USE_MOCK_AGENT=true` works without |
| `ENABLE_AI_AGENT` | Optional | `/api/chat/*` | |
| `ENABLE_ORDER_REQUEST_DRAFTS` | Optional | Catering drafts | |
| `OBJECT_STORAGE_PROVIDER` | Recommended | POD media | `s3` + bucket for staging |
| `SMTP_*` | Recommended | Email OTP | Or `OTP_DEV_LOG_WHEN_NO_SMTP=true` locally |

## Webhook URLs (staging)

- Razorpay payments: `https://<staging-host>/api/payment/webhook`
- KYC provider: `https://<staging-host>/api/webhooks/kyc`

## Post-deploy

```bash
cd backend
npm run migrate:up
npm run test:smoke
RUN_E2E_MONEY_LOOP=true npm run e2e:money-loop
node scripts/smoke_load.js https://<staging-host> 30
```
