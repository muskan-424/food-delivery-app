# Go-live signoff (TOMATO)

Complete this checklist for every production release. Store the signed copy in your release tracker.

## Release metadata

| Field | Value |
|-------|-------|
| **Release version / git tag** | |
| **Environment** | production / staging |
| **Release owner** | |
| **Rollback owner** | |
| **On-call engineer** | |
| **Change window (UTC)** | start → end |
| **Linked PRs** | |

## Pre-flight

- [ ] All feature PRs merged to `main`; CI green (unit, integration, frontend, admin, E2E, secret-scan)
- [ ] `.env.staging.example` / production secrets reviewed (no secrets in git)
- [ ] `JWT_SECRET`, Razorpay, webhook secrets set on host
- [ ] MongoDB backup taken; restore tested within last 7 days
- [ ] `npm run migrate:status` planned; rollback path documented if migration is risky
- [ ] Staging passed `npm run smoke:staging` and `npm run test:smoke`
- [ ] Rollback drill completed once ([ROLLBACK_DRILL.md](./ROLLBACK_DRILL.md))
- [ ] Grafana live if using observability profile (`npm run dev:observability`)
- [ ] Beta scope confirmed ([beta/SUPPORT_PLAYBOOK.md](../beta/SUPPORT_PLAYBOOK.md))

## Deploy execution

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
cd backend && npm run migrate:up && npm run migrate:status
npm run smoke:staging
```

| Check | Result | Notes |
|-------|--------|-------|
| `docker compose ps` healthy | ☐ pass ☐ fail | |
| `GET /api/health` mongo connected | ☐ pass ☐ fail | |
| Smoke + staging script | ☐ pass ☐ fail | |
| User login + place test order | ☐ pass ☐ fail | |

## Rollback decision

| Option | Selected |
|--------|----------|
| Rollback **not needed** | ☐ |
| Rollback **triggered** | ☐ |

**Triggers:** API unhealthy > 5 min; 5xx spike; migration mismatch; payment webhooks failing.

## Signoff

| Role | Name | Date (UTC) | Approval |
|------|------|------------|----------|
| Release owner | | | |
| Engineering lead | | | |
| Product / beta lead | | | |

## Post go-live (first 60 minutes)

```bash
node scripts/go_live_watch.js --base-url https://YOUR_API --minutes 60 --interval 60
```

- [ ] No sustained 5xx on Grafana
- [ ] Razorpay webhook test event received (if configured)
- [ ] One beta order completed or dry-run verified
- [ ] No Sev-1 open at T+60m
