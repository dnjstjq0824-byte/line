# LUNO Staging Verification & Production Deployment / Rollback Plan

## 1. Deployment Governance (Strict Compliance with Section 0.7)
- **Current State**: All code changes, build artifacts (`./dist_cf`), and automated tests are verified in local/staging environment.
- **Production Gate**: Production deployment (`npx wrangler deploy`) is **HELD** pending explicit PO approval.

## 2. Step-by-Step Deployment Procedure (Upon PO Approval)
1. Verify all 10 Cloudflare Worker tests and Go backend tests pass (`0 failed`).
2. Build combined distribution: `node scripts/build_cf.js`.
3. Deploy to Cloudflare Workers production: `npx wrangler deploy`.
4. Run post-deploy smoke checks against `https://line-messenger.dnjstjqppk.workers.dev/healthz`.

## 3. Instant Rollback Procedure
- **Cloudflare Worker Rollback**: `npx wrangler rollback` restores the previous immutable Worker deployment in < 10 seconds while preserving Durable Object storage.
- **Git Revert**: `git revert HEAD` followed by `node scripts/build_cf.js`.
