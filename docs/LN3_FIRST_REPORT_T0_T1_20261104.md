# LN3 첫 보고서 — 인계 무결성 / T-0 / T-1 D1

측정일: 2026-11-04 KST. 본 보고서는 PO 검수 전 제출물이다. 제품 코드 변경 0개, 운영 배포 0회, 운영 DB 변경 명령 0회. T-2~T-5는 시작하지 않았다. 자체 확인은 최종 승인이나 다음 단계 착수 승인을 의미하지 않는다.

## A. 인계 파일 무결성

입력은 개별 파일 전달이 아니라 `luno_1.zip` 1개이며, 내부 파일은 31개다. 원본 ZIP과 첨부 지시문은 수정·재배치·재압축하지 않았다. 입구 문서를 먼저 읽은 뒤 S1·S2·K2를 대조했다.

| 검증 항목 | 실측 | 판정 |
|---|---|---|
| 수령 파일 | 기대 31개 / ZIP 엔트리 31개 / 각 기준 파일명 1개씩 | 수량 일치 |
| 실제 바이트 | 31/31 기준 일치 | 일치 |
| SHA-256 | 전체 64자리 계산, 앞 16자리 31/31 일치 | 제공된 접두 해시 기준 일치 |
| 로고 12개 합계 | 80,360 bytes | 일치 |
| LN6 | 8,583 bytes / `553815ee4bb4581f` | 최신 지시의 정정값 일치; 구 값은 불일치로 집계하지 않음 |
| 경로 | 17개가 기준 디렉터리 없이 ZIP 루트에 있음 | **FAIL — 경로 불일치** |
| 전달 형태 | 개별 파일 대신 ZIP | 지시와 차이; 임의 정상 처리하지 않음 |

전체 파일별 기준 경로·실제 ZIP 경로·기준/실측 바이트·기준 접두 해시·전체 실측 SHA-256은 [31개 파일 검증표](LN3_INTAKE_INTEGRITY_20261104.csv)에 있다. 누락 파일과 내용 불일치는 0개다. 단, 기준은 앞 16자리뿐이므로 전체 64자리 정본 해시와 일치한다고 주장하지 않는다.

경로 불일치 17개: `handoff/tokens.css`, `handoff/tokens.json`, `handoff/디자인_가이드라인.md`, `handoff/strings/ko.json`, `handoff/strings/en.json`, `logo/final/`의 로고 12개. 실제 엔트리는 모두 해당 basename으로 ZIP 루트에 있다. basename 대응은 검증표 작성을 위한 식별이며, 경로 복원·설치 승인으로 해석하지 않았다.

검증 실행: .NET ZipFile.OpenRead → 각 엔트리 스트림 SHA256.ComputeHash → 실제 Length와 기준 바이트 비교 → 64자리 해시의 앞 16자리 비교 → 원래 경로 비교. 실행 로그 요약: `ArchiveFiles=31; ExpectedFiles=31; ContentMatches=31; PathMismatches=17; LogoBytes=80360; MeasuredUTC=2026-11-04T10:44:25.2924598Z`.

**무결성 게이트는 경로 문제로 미통과다. 코드 작업을 시작하지 않았으며, 명시적으로 허용된 읽기 전용 조사와 증거 수집만 수행했다.**

## B. T-0 운영 현황

### 실측 범위와 접근 가능 여부

- 소스: 로컬 Git 저장소 읽기 가능. 작업 브랜치는 `audit/messenger-foundation-20261104`, HEAD는 `e9cbad40bfa6423fe0fb027235cb2e56bc85929b`. 시작 시 작업 트리는 깨끗했다.
- 공개 운영 HTTP: 버전·Health·Ready GET 가능. 최초 19:42:51~53 KST, 증거 저장 재측정 19:46:45 KST에 같은 결과.
- 운영 Cloudflare: 배포 이력 조회 가능. D1 메타데이터 읽기 가능. 사용자 행, 비밀번호, 토큰, 결제 데이터는 조회하지 않았다.
- 실계정·브라우저 클릭·로그인·세션 해지·메시지 전송은 수행하지 않았다. 해당 기능의 이번 단계 실동작 판정은 **NOT TESTED**다.
- Go/PostgreSQL 구현도 저장소에 있으나, 운영 Worker/D1과 같은 배포물로 취급하지 않았다. 이전 PostgreSQL CI 성공은 운영 D1의 S1/S2 충족 증거가 아니다.

### 운영 버전 및 Health

호스트: `https://line-messenger.dnjstjqppk.workers.dev`.

| 항목 | 실측 |
|---|---|
| GET /api/v1/version | HTTP 200 |
| 운영 응답 commit | `b587897a337b29219410037acc8c373f834bae19` |
| worker_version | `v2.0.0-remediated` |
| build_time | `2026-11-04T08:52:13.120Z` = 2026-11-04 17:52:13.120 KST |
| env / brand | production / LUNO |
| GET /healthz | HTTP 200, `{"status":"ok","brand":"LUNO","runtime":"cloudflare-worker"}` |
| GET /readyz | HTTP 200, 동일 본문 |
| 현재 배포 ID | `c1add9b9-4e21-4324-8f00-8f0567c8f54a` |
| 현재 Worker 버전 ID / 트래픽 | `9afb62f5-0834-4e03-93ee-7a6fdc1ab6f0` / 100% |
| 배포 생성 시각 | `2026-11-04T08:52:18.422647Z` = 17:52:18.422647 KST |

commit/build_time은 운영 API의 **자기 신고값**이다. 배포 ID와 버전 ID는 Cloudflare 배포 이력에서 별도로 조회했다. 배포 바이너리와 Git 소스의 비트 단위 동일성은 검증하지 않았다. Health/Ready 구현은 [Worker](../scripts/cf_worker.js#L2838)의 고정 상태 응답이므로, HTTP 200을 DB·외부 연동·전체 서비스 정상으로 확대 판정하지 않는다.

원 응답, 측정 UTC, CF-Ray, D1 DDL, 조회 메타데이터, 개인정보를 제외한 배포 이력은 [실측 증거 JSON](LN3_T0_T1_EVIDENCE_20261104.json)에 보존했다.

### 직전 기준과의 차이

지시 기준 `76f03a7` / 빌드 `2026-10-31`과 현재 운영 응답은 **불일치**한다. 운영 응답은 `b587897` / `2026-11-04`이다. 로컬 Git에서 기준 전체 SHA는 `76f03a7aa089d10b46039ae18fc0e66db22d4385`, 해당 커밋 시각은 2026-11-01 03:05:48 KST다. 기준 문서의 빌드 날짜와 커밋 시각은 서로 다른 정보이며 임의 보정하지 않았다.

`git diff --stat 76f03a7 b587897`은 32개 파일, 2,569줄 추가·552줄 삭제다. Worker·Vue·Flutter·일부 Go·배포 설정·문서가 포함된다. 이는 두 Git 스냅샷의 차이이지, 모든 차이가 운영에 배포되었다는 증거가 아니다.

사용자가 첨부한 [기존 파일 인벤토리](FOUNDATION_AUDIT_INVENTORY_20261104.csv)는 348개 로컬 파일의 크기 목록이다. 현재 해당 경로 누락 0개, 크기 차이 7개를 확인했다. 같은 크기의 내용 변경은 잡지 못하므로 이 목록을 운영 해시 대장으로 사용하지 않는다. 이전 감사 커밋은 이번 지시 수령 이전 작업이며, 이번 단계 변경 수에 합산하거나 새 승인으로 간주하지 않았다.

### 롤백 앵커

향후 승인된 변경 직전 복귀 대상을 현재 운영 Worker 버전 **`9afb62f5-0834-4e03-93ee-7a6fdc1ab6f0`**으로 기록한다. 배포 이력의 존재와 100% 적용은 확인했다. 직전 배포 버전은 `9097851e-9a23-4294-9620-d8fd769cbe9c` / 2026-11-01 03:06:20.511816 KST다.

이 앵커는 코드/Worker 버전 식별자이며 D1 데이터 복원 지점이 아니다. DB 백업·복구 가능성과 실제 롤백 실행은 **NOT TESTED**다. 이전 버전과 `76f03a7`의 대응도 미검증이다. PO가 현재 운영 상태 대신 다른 기준으로 복귀하도록 결정할 경우 앵커를 별도로 지정해야 한다. 어떤 롤백도 실행하지 않았다.

## C. T-1 D1 차분표

분류는 정본 대비 차이의 목록이다. **추가**는 대응 객체/경로를 조사 범위에서 찾지 못했다는 뜻이며 신규 구현 승인이 아니다. **변경**은 대응 구현이 있지만 이름·필드·제약·계약이 다르다는 뜻이다. **유지**는 명시된 일부 이름/필드가 일치한다는 뜻이며 기능 전체 PASS가 아니다. 설계 선택, 테이블 통합, 마이그레이션 작성은 하지 않았다.

### 운영 DB 실측 근거

실행 명령:

```text
npx --no-install wrangler d1 execute line-messenger-db --remote --command "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name" --json
```

결과: 테이블 21개 = 애플리케이션 20개 + Cloudflare 내부 `_cf_KV` 1개. 명시적 인덱스 4개이며 SQLite 자동 인덱스는 조회 필터에서 제외했다. `success=true`, `rows_written=0`, `changes=0`, `changed_db=false`. FK·CHECK·UNIQUE에 관한 아래 관찰은 운영 `sqlite_master.sql` DDL 기준이다. 사용자 데이터의 무결성이나 제약 위반 행은 조사하지 않았다.

운영 애플리케이션 테이블 전 목록:

```text
albums, conversation_members, conversations, events, friends, keep_items,
luno_attachments, luno_audit, luno_messages, luno_read_cursors,
luno_sessions, luno_ws_tickets, message_reactions, messages, notes,
openchat_rooms, polls, users, wallet_transactions, wallets
```

저장소에는 [기존 D1 SQL](../scripts/schema_d1.sql)과 [Worker 런타임 DDL](../scripts/cf_worker.js#L110)이 함께 있다. SQL 파일의 존재만 보고 운영 적용을 추정하지 않았으며, 위 목록은 운영 메타데이터로 확인했다.

### S2의 19개 테이블/관계 대조

| 구분 | S2 기준 | 현행 운영 D1 / 차이 | 근거 위치·검증 상태 |
|---|---|---|---|
| 변경·일부 유지 | users: id PK, email UNIQUE, password_hash, role/status/locale/is_official 등 | id/email/password_hash/display_name/avatar_url/status_message/created_at/updated_at 존재. role/status/locale/is_official 없음. bio/phone_number는 현행 추가 필드 | 증거 JSON users DDL; [기존 SQL](../scripts/schema_d1.sql#L3). 스키마 실측 |
| 변경 | sessions: refresh_token_hash/family_id/expires_at/revoked_at/user_agent/device_id | sessions 이름 없음. luno_sessions에 token_hash PK, session_id UNIQUE, user_id, role, device_name/platform/ip, 시각·해지 필드. refresh/family/expires_at/user_agent/device_id 없음. user_id FK 없음 | 증거 luno_sessions·인덱스; [Worker](../scripts/cf_worker.js#L112). 스키마 실측 |
| 변경 | friendships: 복합 PK, is_favorite/blocked | friends 복합 PK와 status/created_at 존재. is_favorite/blocked 없음; 일부 친구 메타는 Map | 증거 friends; [Worker](../scripts/cf_worker.js#L1517). 스키마+소스 대조, 동작 NOT TESTED |
| 변경 | rooms: type dm/group, created_by FK, last_message_id/at | conversations: kind/title/avatar_url/official/created_at/updated_at. created_by 및 last_message_id/at 없음 | 증거 conversations; [기존 SQL](../scripts/schema_d1.sql#L17). 스키마 실측 |
| 변경 | room_members: last_read_sequence/muted/role/PK/FK | conversation_members에 last_read_message_id 존재. luno_read_cursors가 sequence를 별도 저장. muted/FK 없음 | 증거 두 테이블; [Worker](../scripts/cf_worker.js#L124). 스키마 실측 |
| 변경 | messages: room_id, client_msg_id, media_id, sequence, UNIQUE(room_id,sequence), UNIQUE(sender_id,client_msg_id), FK | messages와 luno_messages 병존. luno_messages의 conversation_id/sequence UNIQUE는 있음. client_id는 nullable이며 전송자별 UNIQUE 없음. media_id/FK/deleted_at 없음; unsent 사용. 기존 messages에는 sequence도 없음 | 증거 messages/luno_messages/idx_luno_messages_seq; [Worker](../scripts/cf_worker.js#L118). 스키마 실측 |
| 추가 | calls: caller/callee/media/duration/missed 등 | 대응 영속 테이블 없음. 코드에 callSessions Map은 있으나 S2 테이블 충족 아님 | 운영 전체 DDL; [Worker](../scripts/cf_worker.js#L16). 스키마 실측, 통화 동작 NOT TESTED |
| 변경·일부 유지 | wallets: user_id PK, balance, currency, updated_at | user_id/balance/updated_at 존재. currency 없음. DDL 기본 잔액 100000 | 증거 wallets; [기존 SQL](../scripts/schema_d1.sql#L68). 스키마 실측 |
| 추가 | points | 대응 테이블 없음 | 운영 전체 DDL. 스키마 실측 |
| 변경 | transactions: type/points_delta/balance_after/client_msg_id UNIQUE/memo/ledger | wallet_transactions: id/from_user_id/to_user_id/amount/note/created_at만 존재. 멱등키·원장 타입·잔액·포인트 필드/FK 없음 | 증거 wallet_transactions; [기존 SQL](../scripts/schema_d1.sql#L74). 스키마 실측 |
| 추가 | articles | 대응 테이블 없음 | 운영 전체 DDL. 스키마 실측 |
| 추가 | bookmarks(user_id,article_id) | 대응 테이블 없음. keep_items는 article_id가 없는 별개 객체 | 운영 DDL keep_items. 스키마 실측 |
| 변경 | media: owner_id/kind/size/storage_key/status/FK | luno_attachments: conversation_id/owner_id/name/mime/size/b64/created_at. kind/storage_key/status/FK 없음 | 증거 luno_attachments; [Worker](../scripts/cf_worker.js#L131). 스키마 실측 |
| 추가 | reports: target_type/id/reason/status/resolved_by/at | 대응 테이블 없음. adminReports 배열은 영속 스키마 아님 | 운영 전체 DDL; [Worker](../scripts/cf_worker.js#L69). 스키마+소스 대조 |
| 추가 | moderation_actions | 대응 테이블 없음 | 운영 전체 DDL; [Worker](../scripts/cf_worker.js#L2413). 스키마+소스 대조 |
| 추가 | feature_flags: payload/updated_by/updated_at | 대응 테이블 없음. 코드 내 플래그 배열 존재 | 운영 전체 DDL; [Worker](../scripts/cf_worker.js#L2404). 스키마+소스 대조 |
| 변경 | audit_logs: actor_id/action/target_type/id/metadata/created_at 인덱스 | luno_audit: actor/action/target/detail/created_at. target_type 및 created_at 명시 인덱스 없음 | 증거 luno_audit; [Worker](../scripts/cf_worker.js#L126). 스키마 실측 |
| 추가 | backup_codes: code_hash/used_at | 대응 테이블 없음 | 운영 전체 DDL. 스키마 실측 |
| 추가 | push_devices: user/platform/push_token/last_seen_at | 대응 테이블 없음 | 운영 전체 DDL. 스키마 실측 |

S2의 복합 PK와 현행 일치 부분: friends(user_id,friend_id), conversation_members(conversation_id,user_id), luno_read_cursors(conversation_id,user_id). 명칭·관련 필드가 달라 S2 전체 충족으로 판정하지 않는다. 원장 원자성·메시지 채번 원자성·24시간 멱등·실제 읽음 불변식은 이번 단계에서 쓰기 시험을 하지 않아 **NOT TESTED**다.

### S1 API 대조

경로는 `/api/v1` 기준이다. 아래는 로컬 Worker 라우터와 조회된 Git 소스의 정적 대조이며, 인증이 필요한 운영 API의 호출 성공이나 오류 상태를 실측했다고 주장하지 않는다. 운영 버전이 신고한 Git 커밋과 현재 Worker의 라우터 차이는 BUILD_INFO와 공개 호스트 게이트 부분이며 아래 계약 라우트는 동일하다. 단, 배포 바이너리의 실제 소스 동일성은 미검증이다. [라우터 진입](../scripts/cf_worker.js#L2903), [확장 라우터 호출](../scripts/cf_worker.js#L3141), [Go 라우터](../backend/internal/server/core.go#L301)는 별개 구현이다.

| 구분 | S1 기준 경로·계약 | 현행 Worker 소스의 대응·차이 | 증거 / 상태 |
|---|---|---|---|
| 유지(공개 응답) | GET /version 단일 정보 출처 | 경로 존재, 버전 응답 실측. 모든 표면의 일치 여부는 미검증 | [Worker](../scripts/cf_worker.js#L2841), 증거 JSON / HTTP 200 실측 |
| 변경 | POST /auth/login, expires_in=3600·user 객체·저장된 refresh | expires_in=86400, user_id/role/device_id, 임의 cf-refresh 문자열 응답. user 객체 없음 | [Worker](../scripts/cf_worker.js#L2938) / 소스 대조 |
| 추가 | POST /auth/refresh | Worker 해당 경로 구현 미발견. Go에는 별도 존재 | Worker 전체 경로 검색; [Go](../backend/internal/server/core.go#L303) / 소스 대조 |
| 유지(경로)·변경(오류) | POST /auth/logout | 현재 세션 해지 호출 있음. 성공 status=logged_out; 해지 후 오류 코드는 S1과 다름 | [Worker](../scripts/cf_worker.js#L1480) / 실효 NOT TESTED |
| 유지(경로) | GET /me | 공개 프로필+email/role 반환 경로 존재 | [Worker](../scripts/cf_worker.js#L1435) / 동작 NOT TESTED |
| 추가 | GET /auth/sessions | 해당 경로 미발견. GET /devices 및 /me/devices 존재 | [Worker](../scripts/cf_worker.js#L1488) / 소스 대조 |
| 변경 | POST /auth/revoke, {revoked,device_id}, 재요청409 | POST /auth/sessions/revoke, {status,session_id,self}. 누락/해지 대상 404 경로 | [Worker](../scripts/cf_worker.js#L3078) / 동작 NOT TESTED |
| 변경 | POST /auth/signup | POST /auth/register 존재; 서버 가입 단계 세션 계약과 다름 | [Worker](../scripts/cf_worker.js#L2907) / 소스 대조 |
| 추가 | POST /auth/2fa/setup | 해당 경로 미발견 | Worker 경로 전수 검색 / 소스 대조 |
| 추가 | POST /auth/2fa/verify | 해당 경로 미발견 | 동일 / 소스 대조 |
| 추가 | POST /auth/backup-codes | 해당 경로 미발견 | 동일 / 소스 대조 |
| 추가 | POST /auth/recover (백업 코드) | 해당 Worker 경로 미발견. Go의 계정 복구는 별도 계약 | Worker 검색; [Go](../backend/internal/server/core.go#L306) / 소스 대조 |
| 유지(경로) | PATCH /me | 프로필 필드 갱신 경로 존재; 영속/전 필드 일치는 미검증 | [Worker](../scripts/cf_worker.js#L1436) / 동작 NOT TESTED |
| 변경 | GET /friends, 계약 필드 | 경로 존재. favorite/blocked 등 별도 메타 포함; S1의 last_seen_at 등 전체 계약 미충족 여부 추가 대조 필요 | [Worker](../scripts/cf_worker.js#L1517) / 부분 소스 대조 |
| 변경 | POST /friends/requests | POST /friends 등 존재, 요청·수락의 S1 경로와 다름 | [Worker](../scripts/cf_worker.js#L1517) / 소스 대조 |
| 변경 | POST /friends/:id/block | 친구 상세 메타 변경 등은 있으나 해당 전용 경로 미발견 | [Worker](../scripts/cf_worker.js#L1546) / 소스 대조 |
| 변경 | GET /rooms | GET /conversations, {conversations}; cursor 페이지 계약 아님 | [Worker](../scripts/cf_worker.js#L1621) / 소스 대조 |
| 변경 | POST /rooms | POST /conversations, kind/member_ids 계열 | 동일 / 소스 대조 |
| 변경 | GET /rooms/:id/messages | GET /conversations/:id/messages, before_sequence/기본limit50, {messages,has_more} | [Worker](../scripts/cf_worker.js#L1730) / 소스 대조 |
| 변경 | POST /rooms/:id/messages, client_msg_id/media_id | /conversations 경로; client_id 선택적, attachment_id 메타. 정상/중복 응답과 kind 계약 차이 | [Worker](../scripts/cf_worker.js#L1745) / 영속·동시성 NOT TESTED |
| 변경 | POST /rooms/:id/read | /conversations/:id/read 경로 | [Worker](../scripts/cf_worker.js#L1870) / 다중 세션 NOT TESTED |
| 변경 | POST /rooms/read-all | POST /conversations/read-all | [Worker](../scripts/cf_worker.js#L1608) / 배지 불변식 NOT TESTED |
| 추가 | GET /bookmarks | 해당 경로 미발견; saved-messages는 뉴스 북마크로 간주하지 않음 | Worker 경로 검색 / 소스 대조 |
| 추가 | POST /bookmarks | 해당 경로 미발견 | 동일 / 소스 대조 |
| 유지(경로) | GET /devices | 경로 존재, 세션 목록 조회 호출 | [Worker](../scripts/cf_worker.js#L1488) / 운영 NOT TESTED |
| 유지(경로)·변경(계약) | DELETE /devices/:id | 세션 해지 호출 존재, {status,session_id,self} | [Worker](../scripts/cf_worker.js#L1491) / 운영 NOT TESTED |
| 변경 | GET /calls, peer/direction/media/duration/missed | callSessions 기반 목록, conversation/participants 기반 내부 모델 | [Worker](../scripts/cf_worker.js#L2075) / 계약 대조, 운영 NOT TESTED |
| 변경 | POST /calls (종료 기록) | 통화 시작 경로, kind/conversation_id 기반 | 동일 부근 / 운영 NOT TESTED |
| 변경 | GET /wallet, 잔액·포인트 | balance/currency/transactions 반환, points 없음 | [Worker](../scripts/cf_worker.js#L2243) / 소스 대조 |
| 변경 | POST /wallet/charge, sandbox 명시 | 잔액 Map 갱신, 내부 내역에는 시뮬레이션 문구; 응답 balance만 존재 | [Worker](../scripts/cf_worker.js#L2247) / 운영 미호출 |
| 변경 | POST /wallet/transfer, client_msg_id, fee0, floor(amount/1000), kind=transfer | POST /wallet/send, 메모리 잔액·내역, kind=pay, 잔액부족402. 계약 필드/포인트/멱등/원장 트랜잭션 미구현 부분 | [Worker](../scripts/cf_worker.js#L2256) / 소스 대조, 송금 미실행 |
| 추가 | GET /wallet/transactions (커서) | 해당 경로 미발견; /wallet에 최대50건 포함 | [Worker](../scripts/cf_worker.js#L2243) / 소스 대조 |
| 변경 | POST /media, upload_url·종류별 상한 | POST /attachments의 base64 흐름. 상수 MAX_ATTACHMENT_B64=2000000; S1 20/100/25MB 계약과 다름 | [Worker](../scripts/cf_worker.js#L70), [첨부](../scripts/cf_worker.js#L2058) / 소스 대조 |
| 추가 | POST /media/:id/complete | Worker 해당 경로 미발견. Go uploads 계열은 다른 경로 | [Go](../backend/internal/server/core.go#L316) / 소스 대조 |
| 유지(경로)·변경(집계) | GET /admin/stats, 실집계 | Map·배열 개수 집계. 운영 DB 전체 실집계와 동일하다고 볼 수 없음 | [Worker](../scripts/cf_worker.js#L2395) / 운영 수치 미조회 |
| 유지(경로) | GET /admin/users | 경로 존재. cursor 계약 아님 | [Worker](../scripts/cf_worker.js#L3629) / 운영 NOT TESTED |
| 추가 | GET /admin/users/:id | 해당 전용 경로 미발견 | Worker 경로 검색 / 소스 대조 |
| 변경 | POST /admin/moderation/actions: target_user_id, reinstate, 201 action_id/applied_at | subject_user_id/user_id, activate 등, 응답200 status/action/user_id | [Worker](../scripts/cf_worker.js#L2413) / 제재 미실행 |
| 유지(경로)·변경(저장소) | GET /admin/reports | adminReports 배열. reports 영속 테이블 없음 | [Worker](../scripts/cf_worker.js#L2402), D1 DDL / 동작 NOT TESTED |
| 추가 | POST /admin/reports/:id/resolve | 전용 경로 미발견. moderation에 일부 report 처리 존재 | [Worker](../scripts/cf_worker.js#L2424) / 소스 대조 |
| 유지(경로) | GET /admin/feature-flags | 경로 존재, 배열 반환 | [Worker](../scripts/cf_worker.js#L3615) / 운영 NOT TESTED |
| 변경 | PATCH /admin/feature-flags | PUT 사용. updated_by/updated_at 영속 필드 없음 | [Worker](../scripts/cf_worker.js#L2404), D1 DDL / 미변경 |
| 유지(경로)·변경(저장소) | GET /admin/audit-logs | auditLogs 배열 반환; 쓰기 일부는 luno_audit에 별도 존재 | [Worker](../scripts/cf_worker.js#L2403), [감사 기록](../scripts/cf_worker.js#L208) / 전수 동기화 NOT TESTED |

### 공통 계약 차이

| 구분 | 정본 기준 | 현행 근거 | 상태 |
|---|---|---|---|
| 변경 | S1 공통 오류: error.code/message/details | [bad](../scripts/cf_worker.js#L1012)와 인증 실패는 error 문자열. SESSION_REVOKED 분류 없음 | 소스 차이 확인; 운영 토큰 시험 NOT TESTED |
| 변경 | S1 커서: 기본30/최대100, items/next_cursor/has_next | 목록별 배열 키·before_sequence·기본50 등 서로 다름 | 소스 차이 확인 |
| 변경 | S1/S3 access1시간, refresh30일·회전·패밀리재사용탐지 | [SESSION_TTL_MS](../scripts/cf_worker.js#L110)=24시간; luno_sessions에 refresh/family/expires_at 없음; Worker refresh 경로 미발견 | DDL+소스 차이 확인; 수명 경과시험 NOT TESTED |
| 변경 | 해지 즉시 전 API 401 SESSION_REVOKED | [getAuthUser](../scripts/cf_worker.js#L970)는 D1 revoked_at 대조 후 null, 호출부는 generic unauthorized | 해지 효과의 재시험은 NOT TESTED. 이전 회귀 결과를 이번 운영 실측으로 대체하지 않음 |
| 변경 | 송금·메시지 client_msg_id 필수, 24시간 중복 제거 | 메시지 client_id 선택, 현행 UNIQUE는 방/sequence뿐. wallet/send에 멱등키 없음 | 소스+스키마 차이 확인 |
| 유지(경로 권한 개념)·변경(별도 구현) | S1 전 admin/* role=admin | Worker는 admin 검사. Go는 platform_admin/moderator 체계로 다름 | [Worker](../scripts/cf_worker.js#L2393), [Go](../backend/internal/server/core.go#L425); 운영 권한 시험 NOT TESTED |

## D. PO 판단·검수 대기 항목

1. **인계 경로**: 내용 일치는 확인했지만 17개 경로가 다르다. 원 경로가 보존된 전달본 또는 명시적인 대응 경로 확정이 필요하다. 이 보고서는 경로를 임의 복원하지 않았다.
2. **T-0 기준 갱신 및 앵커**: 운영 자기 신고 commit/build는 기존 기준과 다르다. 현재 배포 버전 ID를 복귀 앵커로 기록했으며 PO 검수 대상이다. DB 복원 앵커는 별도 미확인이다.
3. **D1 대조 결과**: S1 rooms/media/transfer 등과 현행 conversations/attachments/send, S2 대상과 기존/luno_* 테이블이 다르다. 어떤 인터페이스나 테이블을 유지·전환할지 결정하지 않았다.
4. **정본 내부 차이**: S1 메시지 kind 요청 enum에는 transfer/call_status/security_notice가 없지만 S1 §6은 transfer 메시지를 요구하고 S2 kind에는 세 항목이 있다. 본 단계에서는 차이로만 보고한다. 또한 새 지시의 LN2-08 설명과 S1의 현행/목표 UA 403 표현은 정책 확정 전 재대조 대상이다. 이번 단계에서는 UA 정책을 바꾸지 않았다.
5. 세션 실효, 다중 계정, 클릭 프로브, 송금 원자성, 메시지 영속·읽음 재시험은 미실행이다. 로그인부터 운영 기록을 변경할 수 있어 읽기 전용 단계에서 실행하지 않았다. 테스트 환경·실계정 범위 확정과 해당 단계 승인이 필요하다.

상태: **첫 보고서 제출 / 무결성 경로 게이트 미통과 / T-0·T-1 PO 검수 대기.** 제품 준비 완료나 설계 승인 PASS를 선언하지 않는다.

## E. 변경 관리·Git

기존 추적 파일의 `git diff --stat`는 비어 있다. 제품 코드 수정·신규·삭제 0개, 기존 인벤토리와 첨부 원본 수정 0개. 신규 산출물은 아래 3개뿐이다.

| 파일 | 유형 | 대응 | 목적 | 검증 |
|---|---|---|---|---|
| [LN3_FIRST_REPORT_T0_T1_20261104.md](LN3_FIRST_REPORT_T0_T1_20261104.md) | 신규 보고서 | T-0/T-1 | 첫 보고·D1 차분·미결정 목록 | 증거 대조; PO 미검수 |
| [LN3_INTAKE_INTEGRITY_20261104.csv](LN3_INTAKE_INTEGRITY_20261104.csv) | 신규 증거표 | 인계/T-1 입력 | 31개 전체 바이트·해시·경로 | 내용31일치/경로17불일치 |
| [LN3_T0_T1_EVIDENCE_20261104.json](LN3_T0_T1_EVIDENCE_20261104.json) | 신규 실행 증거 | T-0/T-1 | 공개 GET·D1 DDL·배포 이력 | 조회 성공/DB rows_written=0 |

단계 상한 3개 이내다. 보고서·CSV·JSON은 원본과 구분되며 자동 산출 증거를 커밋하지 말라는 이번 지시를 따라 **커밋·푸시하지 않았다**. Git HEAD는 시작 시와 동일한 `e9cbad40bfa6423fe0fb027235cb2e56bc85929b`이다. 빌드·테스트·코드 생성·배포·스토어 제출은 실행하지 않았다.

중단 근거는 이번 첨부 지시 §4의 “T-0 및 T-1 검수가 통과되기 전까지 T-4 및 T-5 코드 변경을 시작하지 않는다”와 §1의 파일 경로 대조 요구다. 경로 게이트와 PO 검수가 해소되기 전 후속 구현으로 진행하지 않는다.
