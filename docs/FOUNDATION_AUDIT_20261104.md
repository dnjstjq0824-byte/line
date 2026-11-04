# Messenger foundation audit checkpoint — 2026-11-04

This is an incomplete execution checkpoint against the master directive, not a full
repository certification. **NOT DESIGN-READY / NOT PRODUCTION-READY.**

## A. Repository audit summary

Baseline: clean `main`; 348 tracked files, including 137 files with source,
schema, protocol, or workflow extensions. The accompanying
[inventory](FOUNDATION_AUDIT_INVENTORY_20261104.csv) records the baseline files and
sizes. Inventory does not imply individual review or functional verification.
Reviewed the configuration, test entry points, CI, gateway host gate, Go startup,
SQLite SQL translation, migration files, and selected messaging/security paths.
Every other feature remains unverified unless supported by a specific test below.

Fixed findings:

| Severity | Finding | Change and evidence |
|---|---|---|
| High | Public workers.dev/pages.dev hosts implicitly enabled standalone seeded accounts and passwordless demo login | Require explicit public hostname allow-list; deployed default disables standalone demo. Regression failed with 200 instead of 503 before repair, then passed. |
| High | Go startup discarded invalid message cipher configuration, allowing a nil cipher with plaintext fallback | Validate JWT and message encryption configuration before opening DB. Three invalid-configuration cases pass. |
| Medium | SQLite rewrite duplicated IF NOT EXISTS in incremental table/index migrations | Consume the optional clause before rewriting; complete migration replay passes. |
| Medium | SQLite cannot execute PostgreSQL ADD COLUMN IF NOT EXISTS | Inspect local table metadata and add only absent columns; complete migration replay passes. |
| Medium | Backend CI ignored database-only changes and skipped actual PostgreSQL tests | Add database path trigger, isolated PostgreSQL 16 service, initial schema creation, incremental replay, and test DSN. Remote CI execution is not yet verified. |
| Medium | Web CI ignored Worker-only changes | Include scripts/config/lockfile changes and all Worker suites; use npm ci. |
| High | Initial PostgreSQL schema referenced calling.calls before creating it | Move calls creation before call_signals. The real PostgreSQL CI failed before the repair; schema creation now passes. |
| High | Nullable UUID lookups coalesced UUID values with an invalid empty UUID literal | Cast UUID to TEXT before COALESCE in message, session, QR, audit, support and wallet queries. Actual PostgreSQL message sends failed before repair and pass afterward; the other query changes are not individually runtime-certified on PostgreSQL. |
| Medium | Idempotent message retries returned the encrypted stored body | Decrypt retry responses; SQLite restart regression and actual PostgreSQL retry-body assertion pass. |

No broad refactor or production deployment. Existing features were not declared
complete based on static endpoint presence. No application mock was replaced as
part of this checkpoint. Test fixtures use localhost explicitly.

## B. Database schema audit

Five SQL migrations define 97 distinct schema-qualified tables. No new tables,
columns, constraints, or production migrations were introduced here.

`TestAllMigrationTablesExistAndReplay` applies migrations 001–005 twice to a new,
temporary SQLite database through the compatibility driver, verifies all 97
tables exist, and checks that a pre-existing Korean/emoji user record survives
the second application. The test exposed both SQL translation failures before
the fixes. This is local compatibility evidence only: it does not establish
PostgreSQL constraint, locking, index, rollback, or populated-database upgrade
correctness. The compatibility driver deliberately makes initial CREATE clauses
idempotent; the original PostgreSQL initial migration is for an empty DB only.

No local PostgreSQL connection was supplied; its tests skipped locally. A new
ephemeral PostgreSQL 16 database in GitHub CI then exercised real schema creation,
two incremental migration applications and both PostgreSQL test functions with
the full Go race suite. The first CI exposed a forward-reference DDL error; the
second exposed invalid UUID COALESCE queries. Both were repaired, and the third
[Backend CI run](https://github.com/dnjstjq0824-byte/line/actions/runs/41814416389)
passed on commit `54e8583fb256167fa7d9b2a90a241d73a981aa5c`.
No production DB was queried or changed. Production applied-migration history,
schema diff, populated upgrade, full data integrity and code-to-live-schema
consistency remain BLOCKED.
The D1 schema and Go PostgreSQL schema are separate implementations, and their
entire API/storage parity has not been established. D1 tests emulate its API over
Node SQLite; they are not Cloudflare runtime verification.

## C. Feature completion

| Area | Before | Change | Current evidence/status |
|---|---|---|---|
| Public demo exposure | FAIL | Remove implicit Cloudflare-host trust; disable demo default | PASS for host-gate regression only |
| Invalid encryption configuration | FAIL | Fail startup before DB creation | PASS for three configuration cases |
| Local migration execution | FAIL | Correct guarded CREATE and ADD COLUMN translation | PASS for two full applications and data preservation |
| Web applications | Unverified | No UI changes | Six vue-tsc/Vite builds PASS; browser user flows not tested |
| Go messaging/auth/media | Unverified | Startup validation only | Existing integration/regression suite PASS on SQLite; full product acceptance PARTIAL |
| Flutter app | Unverified | No mobile changes | Analyze PASS; four tests PASS; physical-device flows unverified |
| PostgreSQL behavior | FAIL in first two CI runs | Repair DDL order and UUID queries; add isolated CI service | PASS for both PostgreSQL test functions and schema replay in CI; complete API/database acceptance remains PARTIAL |
| Remaining master-directive features | Unverified | No completeness claim | PARTIAL; full feature-by-feature acceptance still required |

## D. Realtime, security and performance

Worker tests cover simulated cross-isolate member-scoped fan-out, ticket
redemption, session revocation and D1-backed persistence between module instances.
These are real assertions against application code using simulated infrastructure.
The checked-in Wrangler configuration has no USER_HUB binding, so deployed
cross-isolate live delivery remains incomplete. Reconnection, real hibernation,
server restart, multiple physical devices and network loss need runtime tests.

Remaining security findings include plaintext message content in Go delivery
outbox/push queue despite encrypted message rows, and encryption's plaintext
fallback if randomness fails. Neither is resolved by startup key validation.
No claim of verified E2EE. Selected Go official-account output still contains
fabricated follower/verification metadata and ignores query failures; broader
silent-success and synthetic-response audit remains necessary.

APNs/FCM delivery, real payment providers, production media storage/scanning,
STT/SFU, and physical-device calling are unverified; external credentials and
test infrastructure must be established. P95/P99, throughput, CPU/memory and
large-concurrency performance were not measured. Performance: BLOCKED pending
defined targets and a representative environment.

Public API behavior changes on deployment: without API_BACKEND_ORIGIN, API
requests fail with 503. Existing deployments are unchanged by this commit.
A deliberate demo deployment requires ALLOW_LOCAL_DEMO=true plus the exact
public hostname in STANDALONE_HOSTS; that mode is not production certification.

## E. Test report

Executed locally:

| Command | Result |
|---|---|
| `node --test scripts/*.test.mjs` | 43 tests PASS, 0 FAIL |
| `npm run build:apps` (VS Code Build web apps task) | All six apps PASS type checks and production builds |
| `go test ./... -count=1 -json` | 19 top-level tests PASS plus 3 subtests; 2 PostgreSQL tests SKIP/BLOCKED |
| `go vet ./...` | PASS |
| `go build ./...` | PASS |
| `flutter analyze` | PASS, no issues |
| `flutter test` | 4 tests PASS |
| Editor diagnostics on changed Go and Worker source | No errors |
| `git diff --check` | PASS |
| PostgreSQL 16 CI: fresh schema + migrations 002–005 twice | PASS after forward-reference repair |
| PostgreSQL-enabled `go test ./... -race` + `go vet ./...` in CI | PASS after nullable UUID repair |
| Vue Applications CI (43 Worker tests and all web builds) | PASS on initial source-change commit; later source changes only affect Go/SQL/docs |

Logs in [Go test evidence](FOUNDATION_GO_TEST_EVIDENCE_20261104.jsonl) preserve
the actual test output and skip events. No all-repository lint script exists;
type checking/vet do not substitute for a complete lint policy. Desktop builds,
browser E2E, mobile release/device tests, live Cloudflare tests,
security penetration tests and performance tests were not run in this checkpoint.
CI outcomes above were retrieved from actual completed GitHub runs, not inferred
from configuration. The successful backend run includes both PostgreSQL tests;
local skip events in the evidence file are retained rather than rewritten.

## F. Git delivery

Target: `origin`, branch `audit/messenger-foundation-20261104`.
Use a feature branch because a push to main automatically deploys Cloudflare and
the directive prohibits unapproved production deployment. Commit and remote HEAD
verification are reported in the final response; the report cannot embed its own
commit hash. No force push, production migration, or deployment is authorized here.

Implementation commits: `c83f01c` (initial hardening), `5d394aa` (DDL order),
`54e8583` (UUID queries and retry responses). The last commit passed
[backend CI](https://github.com/dnjstjq0824-byte/line/actions/runs/41814416389).
[Web CI](https://github.com/dnjstjq0824-byte/line/actions/runs/41813552700) passed
for the Worker/web changes. A report-only commit records these outcomes.

## G. Final product readiness

| Gate | Result |
|---|---|
| Architecture | FAIL — full review incomplete; deployed realtime binding absent |
| Database | FAIL — local compatibility passes; live parity/upgrade unverified |
| Authentication | FAIL — full acceptance unverified despite passing regressions |
| Messaging / Realtime / Multi-device | FAIL — runtime acceptance incomplete |
| File Transfer | FAIL — production storage/scanning and device acceptance unverified |
| Notifications | BLOCKED — external delivery unverified |
| Security | FAIL — unresolved plaintext copies and incomplete audit |
| Performance | BLOCKED — no representative load measurements |
| Build | PASS for six web apps and Go; Flutter analysis/tests pass |
| E2E | FAIL — no full browser/device product flow verification |
| Git Push | See final remote SHA verification |

Do not use this checkpoint as authorization for a production release. The full
master directive, including missing feature completion, remains unfinished.
