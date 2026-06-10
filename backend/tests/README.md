# Backend tests (Phase V)

## Unit tests (Vitest)

From `backend/`:

```bash
npm install
npm test
```

Covers webhook signatures, Razorpay checkout HMAC, bank/PAN validation, escrow verification scoring, notification preference mapping, order status machine, and payout fraud rule evaluation.

## HTTP smoke tests

Requires a running server (`npm run server`) and `.env` with `MONGO_URL`:

```bash
npm run test:smoke
```

## Integration tests (optional, uses real MongoDB)

```bash
# PowerShell
$env:RUN_INTEGRATION_TESTS="true"; npm run test:integration

# bash
RUN_INTEGRATION_TESTS=true npm run test:integration
```

Uses `MONGO_URL` from `.env`. Creates and deletes short-lived test documents.

## AI agent (Phase R)

Set `ENABLE_AI_AGENT=true` in `.env` to enable `/api/chat/*` routes. Without `GEMINI_API_KEY`, `USE_MOCK_AGENT=true` (default) uses rule-based replies.

## Migrations (Phase W)

```bash
npm run migrate:status
npm run migrate:up
```

## Staging E2E (Phase Z)

```bash
RUN_E2E_MONEY_LOOP=true npm run e2e:money-loop
npm run smoke:load
```

## CI

GitHub Actions workflow `.github/workflows/backend-tests.yml` runs `npm test` on push/PR.
