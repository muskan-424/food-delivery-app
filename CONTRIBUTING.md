# Contributing to TOMATO

This repo follows the same **trunk-based** workflow as [air-tasker](https://github.com/muskan-424/air-tasker): one stable `main` branch and short-lived `feature/*` branches merged via pull request.

## Branch naming

| Prefix | Use for |
|--------|---------|
| `feature/<topic>` | New features or platform work (API, UI, CI, ops) |
| `fix/<topic>` | Bug fixes |
| `chore/<topic>` | Tooling, deps, docs-only |

Examples: `feature/ci-pipeline`, `feature/order-chat-ui`, `fix/razorpay-webhook-sync`.

## Workflow

1. Branch from latest `main`:
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-topic
   ```
2. Keep PRs focused — one concern per branch when possible.
3. Before opening a PR:
   ```bash
   cd backend && npm test && npm run test:smoke
   ```
4. Open PR **into `main`**. CI must pass (unit tests, integration when applicable, frontend/admin build).
5. Delete the feature branch after merge.

## Local development

| Command | Description |
|---------|-------------|
| `npm run dev:backend` | API + MongoDB + Redis via Docker Compose |
| `npm run dev:frontend` | User panel (Vite, port 5173) |
| `npm run dev:admin` | Admin panel |
| `npm run dev:all` | Docker backend + both frontends |
| `npm run test:backend` | Vitest unit suite |
| `npm run migrate:status` | Show applied DB migrations |

See [SETUP_AND_RUN_GUIDE.md](SETUP_AND_RUN_GUIDE.md) for environment variables and feature flags.

## Commits

- Use clear messages: `feat:`, `fix:`, `chore:`, `docs:`, `test:` prefixes are welcome.
- Do **not** commit `.env` files — use `.env.example` / `.env.staging.example` templates.

## Feature flags

New marketplace capabilities (escrow, KYC, agent chat, etc.) are gated in `backend/config/appConfig.js`. Document new flags in `backend/docs/FEATURE_FLAG_ROLLOUT.md` when adding behavior that should roll out gradually.
