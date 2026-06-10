# TOMATO closed beta — support playbook

Use this during **closed beta** (`BETA_MODE_ENABLED=true`).

## Scope

- **Geography:** `BETA_CITY_LABEL` + `BETA_PIN_CODES` (delivery PIN allow-list when set)
- **Nav flags:** `BETA_FEATURE_*` env vars gate AI assistant, order chat, group orders, voice
- **Feedback:** Users submit at `/feedback` → `POST /api/beta/feedback`

## Admin KPIs

```http
GET /api/beta/kpis
Authorization: admin token (header: token)
```

Returns 7-day feedback count, new users, orders, open disputes, feedback by category.

## Triage

| Category | Owner | SLA |
|----------|-------|-----|
| payment | Payments / ops | 4h |
| delivery | Logistics | 4h |
| bug | Engineering | 24h |
| ux | Product | 48h |
| other | Product | 48h |

## Escalation

1. Sev-1 (payments down, no orders): page on-call, consider `BETA_MODE_ENABLED=false`
2. Sev-2 (feature broken): disable feature flag, ship hotfix branch
3. Collect feedback ID from `betaFeedback` collection for RCA

## Comms template

> Thanks for trying TOMATO beta in {city}. We received your {category} feedback and will follow up within {SLA}.
