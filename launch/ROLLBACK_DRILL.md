# Rollback drill (TOMATO)

Run on **staging** before every production release.

## Steps

1. Announce drill to release + rollback owners.
2. Verify current stack is healthy:
   ```bash
   npm run smoke:staging
   npm run test:smoke
   ```
3. Record current git tag / commit: `git describe --tags --always`
4. Simulate bad deploy (optional): deploy a known-bad branch to staging only.
5. Execute rollback playbook:
   ```bash
   node scripts/rollback_drill.js --base-url http://localhost:4000 --previous-tag vPREVIOUS
   ```
6. Confirm health + smoke pass after rollback.
7. Document duration and gaps in release notes.

## Rollback commands

```bash
docker compose -f docker-compose.yml -f docker-compose.staging.yml down
git checkout <last-good-tag>
# restore env snapshot if secrets changed
docker compose -f docker-compose.yml -f docker-compose.staging.yml up --build -d
cd backend && npm run migrate:status
npm run smoke:staging
node scripts/go_live_watch.js --minutes 5 --interval 30
```

## Success criteria

- Rollback completed in < 30 minutes (staging target)
- Smoke tests pass on rolled-back build
- No data loss (migrations reversible or forward-only with backup)
