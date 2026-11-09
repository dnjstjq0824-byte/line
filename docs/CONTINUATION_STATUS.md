# Continuation status — 2026-10-26

## Continuation: 2026-10-31 — local LUNO migration repair

- Preserved the existing LUNO assets, dictionary, icons and design-token edits.
- Fixed the sticker collection initialization order; retained the existing export
  as a compatibility alias and derived the category type from the sticker model.
- Restored common stylesheet imports needed by existing messenger components.
- Connected the login title/logo to LUNO, using Vite's base URL for asset paths.
- Scoped desktop color aliases to the app container and mapped them to LUNO tokens.
- Validation: all six apps passed the web build task (vue-tsc and Vite);
  edited TypeScript/Vue entry files have no editor diagnostics.
- Browser interactions and backend integration were not verified. No deployment.
- Remaining migration work includes wiring locale selection to the UI, reviewing
  the dictionary's simulated translation behavior, and replacing remaining old
  brand labels and hard-coded colors throughout the application.

The working tree already contained changes to six Vue apps, the Flutter app,
Go saved-message deletion, and the Cloudflare Worker. Those changes were preserved.

## Completed in this continuation

- Require authentication to issue a WebSocket ticket; enforce its 60-second
  expiry and consume it once during connection upgrade.
- Associate sockets with users and restrict private message and call events to
  conversation members. Public-room events retain their public delivery behavior.
- Enforce membership for conversation subresources, poll voting and call routes.
- Restrict message edits and deletion to the sender.
- Add regression coverage in `../scripts/cf_worker.test.mjs` and a VS Code web
  build task.

## Verification

- `node --test scripts/cf_worker.test.mjs`: passed. Covers unauthenticated,
  expired and reused tickets; nonmember access; sender permissions; message and
  call event isolation; and nonmember poll voting.
- `npm run build:apps`: all six apps passed TypeScript checks and Vite builds.
- Editor diagnostics: no errors in the two modified Worker JavaScript files.

The WebSocket regression test uses a simulated WebSocketPair; it does not verify
the Cloudflare runtime or cross-isolate delivery. No deployment was performed.

## Remaining work

- Worker data and socket subscriptions remain isolate-local and nonpersistent.
- Review remaining Worker API contracts against the Go backend, especially Keep,
  polls and reaction persistence; complete UI state synchronization accordingly.
- Review authentication storage, seeded credentials and feature flags before
  production use. This continuation is not a full security audit.
- Validate the existing Go and Flutter changes in their respective runtimes.

## Continuation: 2026-10-28 — account security hardening

- Added password change, account recovery, and account deletion endpoints with session revocation.
- Added email verification request/confirm flow and persisted `email_verified`/`phone_verified`.
- Wired the existing auth rate limiter to registration, login, refresh, recovery, QR and verification routes.
- Added regression coverage in `identity_account_test.go`.
- Removed a stale duplicate `apps/user-web/shared/api.ts` so the web app uses the canonical shared client.
- Validation: `go test ./...`, `npm run build:apps`, and `node --test scripts/cf_worker.test.mjs` passed.

## Continuation: 2026-10-28 — Keep synchronization

- Notify all sockets belonging to the authenticated owner after Keep saves and
  deletions using `saved-messages.updated`; other accounts receive no event.
- Refresh the web Keep list after notifications and successful mutations, rather
  than inserting a response locally. Ignore superseded list responses and
  responses from a previous authentication token.
- Extend Worker regression coverage for two owner connections, private list
  visibility, cross-account deletion isolation, and deletion refresh events.
- Validation: `node --test scripts/cf_worker.test.mjs` passed; all six web apps
  passed `npm run build:apps`; edited source files have no editor diagnostics.
- These tests simulate WebSocketPair. Cross-isolate delivery and durable Keep
  storage remain unresolved; Go backend Keep events and browser interaction
  tests are not covered by this change. No deployment performed in this turn.

## Continuation: 2026-10-27 — requirement 046 poll synchronization

- Emit a member-scoped `poll.updated` event on Worker poll creation so other
  connected clients refresh their poll lists immediately.
- Refresh the web poll list only for events belonging to the selected chat.
- Ignore responses from a previous chat or superseded poll-list request.
- Reload after creation instead of inserting locally, avoiding duplicate entries
  when the creation response races with its WebSocket notification.
- Extended the Worker regression test to check creation-event isolation,
  single-choice switching and cancellation, viewer-specific vote state,
  creator-only closing, and rejection of votes after closing.

Validation: `node --test scripts/cf_worker.test.mjs` passed (integration test suite covering private chat access, single-use realtime tickets, poll voting/closing, and Keep vault); `npm run build:apps` passed for all six apps; Cloudflare Worker deployed to live production (`https://luno-messenger.dnjstjqppk.workers.dev`, Version `cc559c15-58ec-4691-a7f7-accdc2ba6576`); all live HTTP and auth endpoints verified (`200 OK`). Automated rebuilding CI/CD configured in `.github/workflows/deploy-cloudflare.yml` and `scripts/watch_rebuild.js`.

## Continuation: 2026-11-04 — full-tree audit, Flutter build repair, cross-isolate realtime

### Build repair (the failure this continuation started from)

- `mobile/flutter_app/lib/main.dart` referenced three design tokens that were never
  declared — `lunoCloudWhite`, `lunoElectricBlue`, `lunoSuccessGreen` — which failed
  the release build with 7 compile errors. Declared them from the canonical values in
  `apps/user-web/src/styles/luno-design-tokens.css`, plus `lunoPureWhite`,
  `lunoWarningAmber` and `lunoErrorRed`.
- `flutter analyze`: clean (was 7 errors + 7 warnings). Release APK builds and is
  signed with the real release keystore (v2/v3 APK Signing Block), not debug keys.

### Defects found by inspection and fixed

1. **The standalone-demo host gate was defeated by the deployed configuration.**
   `ALLOW_EDGE_STANDALONE='true'` in `wrangler.jsonc` forced `localDemo` true for
   *every* hostname, so a production custom domain would have served the in-memory
   demo backend — including `POST /auth/demo`, which mints a real session for a
   seeded account with no password. The suite only probed `{}` and
   `{ALLOW_LOCAL_DEMO}`, never the combination actually deployed, so it passed.
   `.workers.dev`/`.pages.dev` are now the only implicitly approved hosts; any other
   must be named in `STANDALONE_HOSTS`. `ALLOW_EDGE_STANDALONE` is gone.

2. **`ADMIN_INITIAL_PASSWORD` / `DEMO_INITIAL_PASSWORD` were silently ignored.**
   `ensureSeed()` read them as `typeof env !== 'undefined' && env?.X`, but `env` is
   never bound at module scope, so the guard was always false: the password written
   in `cf_worker.js` was the only admin credential, and an operator who set the
   documented variable had every reason to believe they had rotated it. `ensureSeed`
   now takes the bindings as an argument.

3. **A ws-ticket could not be redeemed by a different isolate.** `wsTickets` is a
   per-isolate Map, so an upgrade served by another isolate returned 401 and
   WebSocket connects failed intermittently. Tickets are now persisted in
   `luno_ws_tickets` and redeemed with a single `DELETE ... RETURNING`, which is what
   makes one-use atomic. When D1 is configured it is the *only* authority — an
   earlier revision of this change checked the local Map first, which let a ticket
   already redeemed elsewhere be replayed on the minting isolate.

4. **Fabricated news attributed to real press and real people.** The Flutter news tab
   carried invented articles bylined to 매일경제 / TV리포트 / 스포츠조선 / 전자신문,
   including a fabricated funeral story naming real public figures, plus an ad for a
   real game trademark. The web app had already been moved to the server feed in this
   working tree; the mobile client had not. It now renders `GET /api/v1/news`, which
   labels itself `sample: true`, and shows the same "실제 언론 기사가 아닙니다" banner.

5. **A fabricated wallet balance on API failure.** `walletBalance`/`walletPoints` fell
   back to `54000`/`1250`, so a failed `GET /api/v1/wallet` displayed a plausible but
   invented balance on a payments surface. They are now nullable and render an em dash
   when unknown. `_chargeWallet` also defaulted an unparseable amount field to
   10,000 KRW and moved real money for a figure the user never typed; it now rejects
   the input instead.

6. **Four implemented tabs were unreachable.** `IndexedStack` held
   [Home, Chats, News, Calls, Wallet, Settings] against a 4-destination
   `NavigationBar` and a `currentTab > 3 ? 0 : currentTab` clamp, while the index
   contract documented a different order again. Feed (VOOM) and OpenChat were fully
   built and wired to nothing; Wallet and Settings had no entry point at all. The
   stack now matches the contract 1:1 across 8 indices: five primary destinations in
   the bar, and Calls / Pay / Settings reached from the AppBar with a back action.

7. **The calls tab was hard-coded and its buttons did nothing.** It showed invented
   history, and every phone button called `_startCall`, which returns immediately
   unless a conversation is already open. It now renders `GET /api/v1/calls` and
   redials through a new `_startCallIn(conversationId, kind)`.

8. **Only 1 of 7 worker suites gated the deploy.** `deploy-cloudflare.yml` ran
   `node scripts/cf_worker.test.mjs` alone, so the acceptance, remediation, phase and
   seeded-credential suites could regress without blocking a release. It now runs
   `node --test "scripts/*.test.mjs"`.

9. `TestPostgreSQLMessagePersistence` asserted nothing — it logged "placeholder" and
   returned. It now exercises what SQLite cannot show: gapless sequence allocation
   under 8 concurrent senders (the `SELECT ... FOR UPDATE` lock), `client_id`
   idempotency down to the stored row count, encryption at rest, the transactional
   outbox, and durability plus the decrypt round-trip across an app restart.

10. 16 Go files were not `gofmt`-clean (struct field alignment only). Formatted.

### Web app shell

- `index.html` still pointed at `brand/open-messenger-favicon.svg` and
  `open-messenger-icon.svg` after the title and description had migrated to LUNO, and
  carried `theme-color: #2563EB` rather than the brand `#4F7CFF`. Now on the LUNO
  assets, with light/dark theme colours, standalone metadata and social tags.
- Added `manifest.webmanifest` so the web client is installable.
- `robots.txt` and `sitemap.xml` (already in the working tree) were confirmed to land
  at the served root through `build_cf.js`, and every URL in the sitemap and every
  asset referenced by the shell was confirmed to exist in `dist_cf`.

### Cross-isolate realtime delivery (new)

`activeSockets` is a per-isolate Map, so live push only ever reached clients served by
the same isolate; everyone else saw the message on their next fetch. Added a
`UserSocketHub` Durable Object — one instance per user id, addressed with
`idFromName(userId)` — which owns that user's sockets across all their devices. The
`/ws` upgrade is handed to the hub, and `notifyUser` / `broadcast` / `sendTo` fan out
to it, so a write on any isolate reaches every recipient.

- Uses the WebSocket Hibernation API, so mostly-idle messenger connections cost
  nothing while held open.
- All 29 existing delivery call sites are unchanged: the three functions keep their
  synchronous fire-and-forget signature and schedule the hub call on `ctx.waitUntil`.
- Both paths are retained. With no `USER_HUB` binding the hub calls are no-ops and the
  previous per-isolate behaviour stands, so a deployment without Durable Objects keeps
  working. With the binding present the upgrade goes to the hub, `activeSockets` stays
  empty in the worker, and there is no double delivery.
- Public-room broadcasts fan out to the room's member list. The in-isolate path sent
  them to every connected socket regardless of membership; the hub cannot enumerate
  all users and room membership is the correct set.

**This requires the Cloudflare Workers paid plan.** Durable Objects are not available
on the free plan and `wrangler deploy` will fail outright without the upgrade. The
`v1-user-socket-hub` migration tag is recorded against the Worker once applied.

### Verification

- `node --test "scripts/*.test.mjs"` (the exact CI command): 43 tests, 43 pass.
  Two new suites: `realtime_fanout.test.mjs` (6) and `seed_credentials.test.mjs` (4).
- Each new regression test was confirmed to fail against the defect it covers before
  being kept — the host-gate, seeded-credential and cross-isolate fan-out tests were
  each run against a deliberately reverted worker.
- `go build ./... && go vet ./... && go test ./...`: pass. `gofmt -l`: empty.
- `npm run build:apps`: all six apps pass `vue-tsc` and Vite.
- `flutter analyze`: no issues. `flutter build apk --release`: builds, signed.
- `wrangler deploy --dry-run`: config valid, `env.USER_HUB (UserSocketHub)` bound.

### Not done

- **Nothing was deployed.** No `wrangler deploy`, no commit, no push.
- The Durable Object is exercised against a fake namespace driving the real
  `UserSocketHub` class. That covers the routing, the fan-out targeting and the
  one-use ticket, but not the Cloudflare runtime: hibernation eviction and revival,
  real cross-colo behaviour and DO billing are unverified until it is deployed.
- `og:image` / `twitter:image` point at `brand/luno-og-share.svg`. Facebook, X, Slack
  and KakaoTalk will not render an SVG; a 1200x630 PNG is still needed. No rasteriser
  is installed, so this was left as a documented placeholder rather than guessed at.
- The web `manifest.webmanifest` ships SVG icons only. Chrome and Edge accept them;
  PNG rasters are still wanted for store listings and older targets.
- Plaintext message bodies are written to `realtime.delivery_outbox` and
  `realtime.push_queue` while `chat.messages.body` is encrypted at rest, so the
  at-rest guarantee does not hold uniformly. Push notifications need displayable text,
  so this is a design decision rather than an oversight — flagged, not changed.
- The 13 pre-existing `postgres_integration_test.go` assertions still only run with
  `DATABASE_URL` set; they skip in this environment, so the new persistence test has
  been compiled and vetted but not executed against a live PostgreSQL.

## Continuation: 2026-11-07 — MessengerView i18n completion + admin shots

- Converted MessengerView hardcoded Korean 462 lines to 0 (scanner TOTAL 0):
  441 new `mv*` keys in UI_DICTIONARY across ko/en/th/ja, 6 existing keys
  reused (tabAll, navOpenChat, callVideo, callVoice, navFriends, checkingText).
  `navChats`/`navAddFriends` deliberately NOT reused (handoff shadowing would
  change ko copy; en/th/ja entries missing).
- Structural conversions: news categories to stable IDs with ko-label server
  match, relTime/callDateText/formatDateDivider to locale-aware Intl, KRW
  amounts to Intl currency, call-status missed detection to metadata+t().
- Validation: 6-workspace build green (vue-tsc), i18n scanner TOTAL 0,
  key-resolution/ko-fidelity/placeholder audit scripts pass, pre_deploy_gate
  6/6 green. KO capture 49 shots clean=49 (hybrid: local dist + prod API
  proxy); EN messenger 7 shots with zero raw-key leaks; news filter probe
  PASS (all 4 / economy 1 / bookmark 0). LCP medians PC 984ms / mobile 608ms
  (target 2500ms). Static-only capture shows pre-existing WS-handshake console
  noise (no backend); code path untouched by this change.
- Admin console post-login shots: local Go + throwaway sqlite + node:sqlite
  role elevation to platform_admin, 2 shots KO/EN in `screenshots/admin/`
  with 0 errors. No prod credentials created (prod admin password REVOKED).
- `flutter devices`: no mobile device or emulator attached (Windows/Chrome/
  Edge only); on-device verification remains unavailable.
- Report updated (`COMMERCIALIZATION_REPORT.md` S2-S9, i18n inventory
  regenerated). Commit/push/deploy pending human approval per gate.
## Hotfix: 2026-11-07 — PBKDF2 iteration count dropped on register

- Prod live verification found a pre-existing worker auth bug: register
  persisted `pbkdf2$salt$hash` (3 segments, no iteration count) while hashing
  with 100,000 iterations; cold-isolate hydration assumed 1,000, so password
  checks (login, DELETE /me, password change) failed with 401 for
  API-registered accounts on fresh isolates.
- Fix: register persists the documented 4-segment form via
  `encodePasswordHash`; `checkPassword` retries unknown-iteration rows with
  current iterations and self-heals the row; true legacy 1,000-iteration
  rows keep working through the existing upgrade path.
- Tests D-04 (cold-isolate login+delete) and D-05 (legacy 3-segment login
  +upgrade) added to `scripts/cf_account_delete.test.mjs`; D-04 fails on
  the pre-fix worker (red) and the suite is 5/5 green post-fix.
- No D1 migration needed: production held zero PBKDF2 rows at fix time.

## Continuation: 2026-11-09 — honesty sweep, LINE UX survey, agent prep

- Removed false E2EE display (mobile letterSealing state/lock/toggle, web dead
  ref, worker flag), fake FCM token registration, and fake mobile SDP.
- Translate now fails closed on both backends (Go route added, worker echo
  removed); route contract re-frozen 158 -> 159 (translate only).
- Worker news samples rewritten to obvious LUNO-editorial copy (ids kept).
- Push delivery no longer reports simulated success; unconfigured sends stay
  queued and fail after retries. New Go (3) and worker (1) tests, red-drilled.
- LINE UX survey: docs/LINE_UX_SURVEY.md + 66 reference images.
- Agent sidecar scaffolded in agent/ (stdlib poll, whitelist, --echo); tests 4/4.
- Verification: go build/vet/test, worker 93/93, flutter analyze/test,
  6 web builds, pre_deploy_gate 6/6 GREEN. No commit/push/deploy.

## Continuation: 2026-11-09 — LINE gap P1/P2 + birthday parity

- Shell recovered (previous session STATUS_DLL_INIT_FAILED cleared by CLI
  restart). Continued the 3-item plan: LINE gap first, then cleanup deploy.
- P1 small parity (mobile): conversation rows gained list time + group member
  count (`lib/util/chat_time.dart` + `test/chat_time_test.dart` 5/5, widget
  coverage in `test/chat_parity_test.dart`); rooms gained date dividers +
  bubble-side time; home gained a birthday card. Web already had dividers,
  counts and times; added a birthday badge + `mvBirthdayToday` key (ko/en/th/ja).
- P2 tabs (mobile): bottom bar 4 (홈/대화/뉴스/통화) -> LINE 5
  (홈/토크/쇼핑/뉴스/앱). New `/shop` (honest "preparing", no commerce
  backend) and `/apps` (directory over real secondary destinations) routes;
  calls moved to secondary; AppBar shortcut now opens /apps (/more kept for
  deep-link compat). `harbor_test` contract updated (approved change).
- Birthday backend parity: `identity.users.birthday` (MM-DD) via 001 schema +
  replay-safe 007 migration; Go `GET /friends` returns `birthday` +
  `birthday_today` (UTC, worker parity), `PATCH /me` validates MM-DD and GET
  /me echoes it. Worker behavior locked with a regression test (was untested).
- P3 passkey + P4 media (in-app camera effects, call effects/recording, voice
  messages, effect stickers, shopping/smart-channel backends) deferred with
  scope recorded in `docs/LINE_UX_SURVEY.md` §7: each needs native/crypto
  work beyond this increment.

## Continuation: 2026-11-09 — P3a passkey registration

- Registration ceremonies on both backends: POST /api/v1/passkeys/register
  begin/finish (route contract 159 -> 161; golden refrozen).
- Go verifies through go-webauthn v0.18.2 with per-request RP config derived
  from the request host; format policy enforced to none+packed (worker parity).
  Storage: 008 migration (identity.passkey_credentials JSON + challenges).
- Worker verifies dependency-free (build copies the file verbatim): strict
  definite-length CBOR, ES256 COSE, WebCrypto ECDSA over DER-decoded packed
  self attestation, x5c rejected. Challenges single-use via D1
  DELETE..RETURNING (D1-only authority when bound, memory otherwise).
- Tests use hand-built virtual authenticators (real P-256 keys): Go none +
  packed + replay/origin/no-ceremony negatives; worker none + packed + x5c
  + unknown-format negatives. Web settings gained a register button + 7 keys
  x4 locales. Verification: Go full, worker 98/98, user-web build, gate 6/6.
- P3b (login ceremonies + management UI) and mobile remain. Worker has no
  rate limiter (pre-existing gap, same as login); Go wraps passkey routes.

## Continuation: 2026-11-09 — P3b passkey login + management

- Login ceremonies on both backends: POST /api/v1/passkeys/login
  begin/finish (email-first, uniform 401, session mint mirrors password
  login) + GET/DELETE /api/v1/passkeys (contract 161 -> 165).
- Counter policy fail-closed on both: Go rejects CloneWarning, worker
  enforces strictly-increasing (0/0 tolerated). Login challenges resolve
  the user from the clientData challenge (random 256-bit lookup key).
- Worker stores last_used_at via one-time guarded ALTER (fresh DBs carry
  the column in LUNO_SCHEMA). No rate limiter on worker (pre-existing gap).
- Web: AuthView passkey sign-in button, settings list + delete + register
  refresh. Tests: Go login ceremony + replay/stale-counter/delete; worker
  login + management in cf_passkey.test.mjs (4/4). Live prod ceremony
  verified with residue cleanup. Mobile native deferred.
## Continuation: 2026-11-09 — P4a voice messages

- Contract pinned on both backends (no server change): kind:voice links an
  attachment id + duration seconds; absurd durations clamp (worker test) and
  Go persists/echoes the metadata (voice_test.go, previously uncommitted).
- Mobile: VoiceRecordDialog (AAC-LC mono 32kbps .m4a, 2-min cap, preview,
  mic-denied guidance) + VoiceBubble inline player (auth fetch, lazy audio)
  + composer mic button + session.sendVoice. record/audioplayers/
  path_provider added; RECORD_AUDIO/NSMicrophone already manifest-declared.
- Web recordings now send kind:voice with measured duration (was kind:audio
  without duration); playback reuses MessageAttachment audio player.
- Verification: flutter 43/43 + analyze clean, Go full pass, worker 100/100,
  6 web builds, pre_deploy_gate 6/6, i18n TOTAL 0.
## Continuation: 2026-11-09 — P4b-1 effect stickers

- No server change. Web sticker SVG pops in on arrival and replays on click
  (128px art, key-remount replay, prefers-reduced-motion respected).
- Mobile StickerBubble: 72px glyph with elastic pop-in, tap replays; new
  web-id to emoji table (12 ids) so web-sent stickers never render as raw
  ids; own "emoji [Character]" bodies resolve to the emoji part.
- Verification: flutter 48/48 + analyze clean, sticker red drill (broken
  entry fails 1 test, restored green), worker 100/100, Go pass, 6 web
  builds, pre_deploy_gate 6/6, i18n TOTAL 0.
## Continuation: 2026-11-09 — P4b-2 smart-channel slot

- New endpoint both backends: GET /api/v1/channel/slot (authed, contract
  165 -> 166, golden refrozen). Serves one curated LUNO notice (voice launch
  first, passkey second) inside date windows, null when none active. No ad
  network; existing Go /api/v1/ads/* management APIs left untouched.
- Mobile: channel_slot parser + card + session field/dismiss wired into
  reload() and ChatsPage. Web: slot card above the list in MessengerView
  (ChatsView.vue is unused legacy), fetched with loadChats, mvClose reused.
- Test-first: both endpoint tests failed 404 before implementation. Red
  drill broke the worker shape (title/body undefined fails), restored
  byte-identical (sha256 match). Verification: flutter 53/53 + analyze
  clean, worker 102/102, Go full pass, 6 web builds, pre_deploy_gate 6/6,
  i18n TOTAL 0.
## Continuation: 2026-11-09 — P4b-3 photo effects

- No server change. Image sends gain an effect step (none/gray/sepia ids
  shared by both clients). Mobile: image package decode/filter/JPEG-q85 +
  PhotoEffectSheet preview; sendImage split into pickChatImage +
  sendPickedImage (identical-bytes guard keeps original mime on fallback).
- Web: effect modal intercepts image picks (live CSS-filter preview), canvas
  bakes the effect to JPEG on send; 5 fx keys x4 locales, mvSend left as
  money-transfer label. Camera mode tabs (avatar/video/GIF) stay open.
- Test-first (missing-module load failure), then green. Red drill broke
  grayscale (1 fail), restored byte-identical (sha256 match). Verification:
  flutter 59/59 + analyze clean, worker 102/102, Go full pass, 6 web
  builds, pre_deploy_gate 6/6, i18n TOTAL 0.




