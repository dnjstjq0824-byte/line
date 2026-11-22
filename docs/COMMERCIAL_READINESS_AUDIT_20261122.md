# LUNO Global Messenger 상용화 준비도 전수 감사 보고서 (2026-11-22)

- **감사 기준일**: 2026-11-22 (KST)
- **감사 대상 커밋**: `28bd913` (`main`, 앱 `2.0.0+21`)
- **실운영 점검 대상**: `https://lunotalk.com`, `https://luno-messenger.dnjstjqppk.workers.dev`
- **최종 판정**: **조건부 NO-GO (실제 상용 메신저 정식 출시 준비 미완료)**

---

## 1. 한눈에 보는 종합 판정

현재 코드베이스는 과거 초기 프로토타입 단계를 넘어 **실제 동작하는 웹 + Android + Cloudflare(Workers / D1 / R2 / Durable Objects) 기반 메신저**로서 상당히 높은 기술적 완성도에 도달했습니다. 핵심 채팅·그룹·E2EE·1:1 통화·FCM 푸시·첨부 R2 저장·비즈니스 콘솔의 자동화 테스트가 모두 녹색입니다.

그러나 **불특정 다수의 일반 이용자를 대상으로 앱스토어/플레이스토어 정식 출시 및 상용 운영하는 기준**에서는 **즉시 출시를 막는 P0 결함 8건**과 **상용 운영 전 반드시 해결해야 할 P1 결함 9건**이 실제 코드와 운영 설정에서 확인되었습니다.

| 평가 축 | 현재 수준 | 상용화 판정 | 핵심 사유 |
| :--- | :---: | :---: | :--- |
| 핵심 메시징 & 실시간 동기화 | 높음 | **PASS (조건부)** | 1:1/그룹/Keep/오픈채팅 D1 영속화, `UserSocketHub` DO WebSocket, `UNBACKED=0` 달성 |
| 종단간 암호화 (E2EE) | 높음 (구현 완료) | **NO-GO** | E1~E10 구현·벡터 일치 완료, 단 `E2EE_ENFORCED` OFF, 외부 보안 감사 미실시, 제한 10건 잔존 |
| 계정 인증·복구·온보딩 | 부분 완료 | **NO-GO (P0)** | 이메일·SMS 실제 발송 드라이버 미구현(`none`/`mock`/`log` 전용) → 비번 찾기/이메일 인증/휴대폰 로그인 불가 |
| 음성·영상 통화 | 1:1 양호 / 그룹 결함 | **NO-GO (P0)** | 그룹 통화 `groupCallRooms`가 isolate 메모리 전용(다중 isolate 깨짐) + Mesh 8명 한계 + 실기기 통화 QA 미확정 + 단일 TURN VM |
| Android 앱 & Play Store | 앱 동작 / 스토어 미비 | **NO-GO (P0)** | 패키지 ID 미정리(`com.bookingnetwork...`), `assetlinks.json` 서명 지문 불일치, Play Store 미등록, `READ_CONTACTS`/약관 불일치 |
| iOS 앱 & App Store | 미완성 | **NO-GO (P0)** | `AppDelegate.swift` 기본 템플릿, `GoogleService-Info.plist`/APNs/CallKit/AASA 전무, `voip` 백그라운드 모드 선언으로 심사 자동 리젝 확정 |
| 데스크톱 앱 (Tauri) | 초기 스캐폴딩 | **NO-GO (P1)** | 구 브랜드(`Open Messenger`), `"csp": null`, 서명·릴리스 파이프라인 전무 |
| 결제·지갑·수익화 | 차단됨 | **NO-GO (P0/범위결정)** | `payments_enabled: false`(503), 활성 시에도 시뮬레이션 충전만 존재, PG/IAP 연동 0% |
| 법적·개인정보 컴플라이언스 | 임시 베타 수준 | **NO-GO (P0)** | 운영사/대표/DPO/연락처 누락, 실제 위탁/국외이전(FCM·R2·Google AI·TURN) 미기재, `READ_CONTACTS` 누락 |
| 인프라·CI/CD·운영 관측성 | 베타 수준 | **NO-GO (P1)** | 타 계정 중계 워커(`lunotalk-proxy`), `rate_limits` 무한 누적, `ALLOWED_ORIGINS`에 `localhost` 잔존, Go 테스트 실패, Flutter CI 및 외부 알림 부재 |

---

## 2. 2026-11-22 실측 검증 결과

감사 과정에서 모든 테스트 스위트, 빌드, 실서버 엔드포인트를 직접 실행해 확인한 결과입니다.

| 검증 항목 | 실행 명령 | 결과 | 상세 근거 |
| :--- | :--- | :---: | :--- |
| Worker / Web 자동 테스트 | `node --test "scripts/*.test.mjs"` | **PASS** | **709 / 709 통과** (fail 0, 135개 테스트 파일, 75.5s) |
| 웹 6개 워크스페이스 빌드 | `npm run build:apps` (`vue-tsc --noEmit && vite build`) | **PASS** | `user-web`, `admin`, `partner`, `developer`, `creator`, `ads` **6/6 에러 0건** |
| Flutter 정적 분석 | `cd mobile/flutter_app && flutter analyze` | **PASS** | **No issues found!** |
| Flutter 전체 테스트 | `cd mobile/flutter_app && flutter test` | **PASS** | **454 / 454 All tests passed!** |
| Go 백엔드 전체 테스트 | `cd backend && go test ./...` | **FAIL** | `internal/auth`, `internal/server` 통과 / **`internal/db` `TestAllMigrationTablesExistAndReplay` 실패** (`expected eight migrations`, 실제 `database/001~010` 10개) |
| 실서버 라이브 게이트 (`lunotalk.com`) | `node scripts/post_deploy_gate.mjs https://lunotalk.com` | **PASS** | `/healthz`, `/readyz`, `/api/v1/version`, 익명 401, JSON 404 모두 정상 |
| 실서버 라이브 게이트 (`workers.dev`) | `node scripts/post_deploy_gate.mjs https://luno-messenger.dnjstjqppk.workers.dev` | **PASS** | 동일 커밋 `28bd913` 응답 확인 |

### 실서버 메타데이터 실측 특이사항 (`GET https://lunotalk.com/api/v1/version`)
- `commit`: `28bd913fee193064987bf44c3ca9074269924324` (`2026-11-21T11:12:00.739Z`)
- **`source_dirty: true`**: 커밋되지 않은 변경이 섞인 워킹 트리에서 실서버 빌드가 생성됨 (릴리스 재현성 위생 결함)
- **`payments_enabled: false`**: 결제/지갑 기능 전면 비활성 상태
- `GET /api/v1/app/latest`: Android `2.0.0` (build `21`, `com.bookingnetwork.messenger.global_messenger`) GitHub Releases 링크 응답
- `GET /api/v1/legal`: `terms_version: 2026-11-21.1`, `privacy_version: 2026-11-21.1`

---

## 3. 이미 상용 수준에 근접하게 구현된 강점

실제 코드와 테스트로 검증된 견고한 기반 영역입니다.

1. **D1 전면 영속화 및 저장소 인벤토리 가드 (`scripts/zero_store_inventory.test.mjs`)**
   - `UNBACKED` (메모리 전용 영속 도메인) **0개** 래칫 달성. 사용자, 세션, 친구, 차단, 대화방, 메시지, 투표, 보관함, 쿠폰, 동의 기록, 비즈니스 콘솔(`DURABLE_BUSINESS=true`)까지 D1 영속화 완료.
   - `bootInRequest()` 및 `ensureSchema()` 재시도로 Workers isolate 간 프라미스 오염 장애 해결.
2. **Durable Object 실시간 WebSocket (`scripts/cf_worker.js:10145`, `UserSocketHub`)**
   - Cloudflare SQLite-backed Durable Object WebSocket Hibernation 기반 실시간 메시지/읽음/프로필 변경 전달 및 1회용 WS 티켓(`luno_ws_tickets`) 적용.
3. **종단간 암호화 (E1~E10 완료, `apps/shared/e2ee/`, `mobile/flutter_app/lib/e2ee/`)**
   - X3DH + Double Ratchet(1:1), Sender Keys(그룹, `luno_sk_parcels`), Keep 암호화, R2 파일당 랜덤 256-bit AES-256-GCM 암호화 첨부, 60자리 안전번호, 복원 문구 기반 암호화 백업/복원까지 웹(TS)과 앱(Dart)이 동일 테스트 벡터(11/11)로 상호 운용.
4. **인증·세션·보안 기본기 (`scripts/cf_worker.js`)**
   - PBKDF2-SHA256(100,000회, Workers 상한), 15분 Access Token, HttpOnly·Secure·SameSite Refresh Token 단회성 로테이션 및 재사용 탐지(토큰 체인 무효화), 5회 실패 15분 잠금, 탈퇴 유예 및 일괄 파기, CSP/HSTS/X-Frame-Options/nosniff 보안 헤더, GCP Vision SafeSearch 업로드 필터.
5. **1:1 통화 및 Android 백그라운드 푸시 (`lib/util/call_push.dart`, `lib/util/push_registrar.dart`)**
   - FCM HTTP v1 실제 연동, data-only 통화 푸시 + 잠금화면 위 전체화면 수신 알림(`USE_FULL_SCREEN_INTENT`) + 포그라운드 서비스(마이크/카메라) + 무세션 거절 토큰(`ring-decline`) + 놓친 offer/ICE 신호 재생(`luno_call_signals`).
6. **풍부한 메신저 UX & 부가 기능**
   - 200종 오리지널 스티커(SVG/PNG), Google Translate 번역, STT/TTS 음성 AI, 5개 웹 콘솔(Admin/Partner/Developer/Creator/Ads), 공식계정 리치메뉴·챗봇 CRM, 4개 앱 언어(ko/en/ja/th) + 18개 언어 랜딩 페이지.

---

## 4. P0 — 실제 상용 출시 차단 결함 (Release Blockers)

아래 8건은 **해결(또는 명시적 범위 제외 및 UI/약관 정리) 없이 정식 상용 출시가 불가능한 차단 항목**입니다.

### P0-1. 이메일·SMS 실제 발송 드라이버 미구현 (`none`/`mock`/`log` 전용)
- **근거**: `scripts/cf_worker.js:3095-3133`, `5143`, `9107`
  ```js
  // F2: mail/SMS driver adapter. Only none (quiet off) and log (persisted
  // log + test outbox) exist; real sending (Resend etc.) is never connected.
  ```
- **영향**:
  - 비밀번호 분실 시 복구 메일 발송 불가(이용자 계정 영구 잠김)
  - 회원가입 이메일 소유권 인증 불가
  - 휴대폰 번호 SMS 로그인 `501` 반환, 연락처 기반 친구 찾기 `503 (PHONE_AUTH_DISABLED)` 반환
- **해결 조건**: Resend/AWS SES/Postmark 등 상용 메일 발송사 및 Twilio/NHN Cloud/Aligo 등 SMS 발송사 실연동(발신 도메인 SPF/DKIM/DMARC 설정 포함).

### P0-2. 이용약관·개인정보처리방침 법령 미준수 및 실제 데이터 처리와 불일치
- **근거**: `apps/user-web/public/legal/terms.html`, `apps/user-web/public/legal/privacy.html`
- **확인된 결함**:
  1. **필수 기재사항 누락(개인정보보호법 제30조·제31조)**: 서비스 운영 주체(법인/상호, 대표자, 주소, 사업자등록번호), **개인정보 보호책임자(DPO) 성명·직책·연락처**, 고객센터 공식 이메일/전화번호가 전부 누락됨.
  2. **실제 처리 위탁 및 국외 이전 고지 누락(개인정보보호법 제28조의8)**: 현재 실서버에서 이미 **Firebase(FCM), Cloudflare R2, Google Cloud(Translation / Speech-to-Text / Text-to-Speech / Vision), GCP TURN VM**을 사용 중인데, `privacy.html` 3항에는 *"Cloudflare Workers·D1만 위탁 중, FCM/APNs·PG 도입 시 공개"* 라고 사실과 다르게 기재됨.
  3. **권한-방침 불일치(Play Store 심사 거절 사유)**: `AndroidManifest.xml:14`에 `READ_CONTACTS` 권한을 선언했으나 `privacy.html` 수집 항목에 연락처 처리 내용이 전혀 없음.
  4. **임시 베타 문구**: *"정식 출시 시 개정될 수 있습니다"*, *"베타 기간 중에는"* 등 상용 효력이 불완전한 초안 문구 잔존.
- **해결 조건**: 변호사/법무 검토 완료된 정식 약관·개인정보처리방침(국외 이전·수탁사·DPO·연락처·연락처 매칭 고지 포함)으로 한·영·일·태 8종 전면 교체.

### P0-3. iOS 네이티브 앱 미완성 및 App Store 심사 리젝 확정 요소
- **근거**:
  - `mobile/flutter_app/ios/Runner/AppDelegate.swift:1-16`: Flutter 기본 템플릿 그대로이며 APNs/FCM/PushKit/CallKit/Universal Link 처리 전무.
  - `mobile/flutter_app/ios/Runner/Info.plist:79-85`: `UIBackgroundModes`에 `voip`가 선언돼 있으나 실제 PushKit/CallKit 미구현 → **Apple App Store Guideline 2.5.4 자동 리젝 사유**.
  - `mobile/flutter_app/ios/Runner/GoogleService-Info.plist`: **파일 부재**.
  - `mobile/flutter_app/lib/util/push_registrar.dart:30-31`, `lib/util/call_push.dart:86`: 푸시 등록과 통화 수신 모두 **Android 전용으로 하드코딩(`TargetPlatform.android` / `Platform.isAndroid`)**.
  - `scripts/cf_worker.js`: APNs 발송 프로바이더 및 `/.well-known/apple-app-site-association` 엔드포인트 부재.
- **해결 조건**: Mac + Apple Developer 계정 확보 → APNs(.p8)/PushKit/CallKit 네이티브 연동 및 `GoogleService-Info.plist` 배치 → 실기기 TestFlight 검증. (iOS를 1차 출시에서 제외할 경우에도 Safari PWA의 웹 통화/알림 한계를 명시해야 함.)

### P0-4. Android Play Store 출시 차단 요소 (패키지 ID·서명 지문 불일치·정책 권한)
- **근거**:
  - `mobile/flutter_app/android/app/build.gradle.kts:35-36`: `// TODO: Specify your own unique Application ID`, `applicationId = "com.bookingnetwork.messenger.global_messenger"` — 과거 프로젝트 네임스페이스 그대로. **Play Store 최초 등록 후 패키지명은 영구 변경 불가**하므로 출시 전 반드시 `com.lunotalk.messenger` 등으로 확정 필요(Firebase/App Links 동시 갱신).
  - `scripts/cf_worker.js:8396-8399` `/.well-known/assetlinks.json`: SHA-256 지문이 구 키(`6D:CD:CD:38:...`)와 디버그 키(`15:09:C9:EE:...`)로 고정돼 있으나, 실제 배포 APK(build 19~21)는 `luno-release-2.jks`(`f2d72ccc...4c977c`, `docs/PROD_ROLLOUT_20261121.md:42`)로 서명됨 → **Android App Links 자동 검증(`autoVerify="true"`) 실패**.
  - `mobile/flutter_app/android/app/src/main/AndroidManifest.xml:20`: `USE_FULL_SCREEN_INTENT` 권한은 Android 14+ Play Console에서 별도 핵심 기능(통화/알람) 심사 선언 필수.
  - `AndroidManifest.xml:71-77`: `ACTION_SEND (image/*)` 인텐트를 받도록 선언해 두고 실제 공유 시 "사진 공유 준비 중" 안내를 띄우는 미완성 상태.
  - 현재 배포 방식이 GitHub Releases 사이드로딩 APK(`v2.0.0-build21`)뿐이며 Google Play Console 등록 및 Play App Signing(AAB) 미완료.

### P0-5. 그룹 통화(`groupCallRooms`) 다중 Isolate 구조적 결함 및 SFU 부재
- **근거**: `scripts/cf_worker.js:4392`, `7886-7909`, `scripts/zero_store_inventory.test.mjs:36`
- **결함 내용**:
  - 1:1 통화는 D1(`luno_call_sessions`, `luno_call_signals`)로 이관되었으나, **그룹 통화 `groupCallRooms`는 여전히 isolate-local `Map` (`EPHEMERAL`)** 으로만 동작합니다.
  - Cloudflare Workers 프로덕션 환경에서 참가자 A와 B가 서로 다른 isolate로 요청되면 `calls/group/signal`에서 `404 (call not found)` 또는 `403 (not a participant of this call)`로 시그널링이 실패합니다.
  - 또한 클라이언트 간 Full-Mesh 방식(최대 8명 `GROUP_CALL_MAX_PARTICIPANTS = 8`)으로 SFU가 없어 4명 이상 영상통화 시 모바일 CPU·배터리·대역폭 한계가 큽니다.
- **해결 조건**: 최소한 그룹 통화 방 상태 및 시그널링을 Durable Object(방 단위 DO) 또는 D1으로 이전. 다인 영상통화 상용화를 위해서는 Cloudflare Calls / LiveKit 등 SFU 도입 필요.

### P0-6. E2EE 강제 비활성(`E2EE_ENFORCED` OFF), 외부 보안 감사 미실시 및 미해결 제한 10건
- **근거**: `wrangler.jsonc`, `scripts/cf_worker.js:2745-2765`, `docs/E2EE_STATUS.md:55-86`
- **결함 내용**:
  - `E2EE_ENFORCED`, `APP_MIN_BUILD`가 프로덕션에 미설정되어 서버는 여전히 1:1/그룹 방에서 평문 메시지를 수락함.
  - 자체 구현한 암호 프로토콜(X3DH/Double Ratchet/Sender Keys)에 대해 **외부 전문 보안 감사(Third-party cryptographic audit) 미실시**.
  - `docs/E2EE_STATUS.md` §3에 기록된 미해결 사항 잔존: 봇 초대 시 평문 전환 확인 UX 미구현, 방 간 `ciphertext` 전달 불가, 백업 방당 200건/클라 8MB 한도, sealed 동영상 임시파일(`sealed-*.mp4`) 정리 수명 미감사, v1 래칫 헤더 평문 등.

### P0-7. 결제·지갑·스토어 수익화 미연동 (`payments_enabled: false`)
- **근거**: `scripts/cf_worker.js:6745-6767`, 실서버 `/api/v1/version` (`payments_enabled: false`)
- **결함 내용**:
  - 지갑 충전/송금/유료 주문 API가 전부 `503 (PAYMENTS_DISABLED)`로 잠겨 있으며, 플래그를 켜도 `wallet/charge` 내부가 `'잔액 충전(시뮬레이션)'` 가상 증액 로직뿐입니다.
  - Google Play Billing / Apple IAP / 국내외 PG(토스·Stripe 등), 영수증 검증, 환불, 크리에이터 정산, 전자금융거래법/통신판매업 준수 체계가 전무합니다.
- **해결 조건**: 1차 상용화를 **100% 무료 메신저**로 범위를 확정한다면 지갑/송금/유료 스토어 UI와 약관 내 유료/송금 문구를 깔끔히 숨김 처리해야 하며, 유료화를 포함한다면 정식 IAP/PG 연동이 선행되어야 합니다.

### P0-8. 실기기 통화·백그라운드 푸시 최종 QA 미확정
- **근거**: `docs/HANDOVER_20261120.md:110-115`
- **결함 내용**: 자동화 단위 테스트는 통과했으나, 실제 단말 2대 기준 **앱 완전 종료 시 전체화면 착신 / 잠금화면 받기·거절 / 통화 중 화면 꺼짐·백그라운드 유지 / 삼성·샤오미 등 OEM 절전 정책(Doze) 하 착신 지연 / iOS Safari 웹↔Android 음성 통화** 실기 검증이 미완료 상태입니다.

---

## 5. P1 — 상용 운영·보안·품질 필수 보완 사항

정식 서비스 오픈 시 장애·보안 사고·운영 마비를 막기 위해 반드시 정비해야 할 항목입니다.

### P1-1. 인프라 단일 장애점(SPOF) 및 Cloudflare 이중 계정 중계 구조
- **계정 분리 중계 (`deploy/lunotalk-proxy/worker.js`)**: 도메인 `lunotalk.com`은 본 계정(`dnjstjq0824`), 실서버(Worker/D1/R2/DO)는 구 계정(`dnjstjqppk`)에 분리돼 있어 모든 요청과 WebSocket이 중계 워커를 한 번 더 거칩니다(지연 증가, 장애 지점 2배, 장애 추적 복잡화).
- **단일 TURN VM (`wrangler.jsonc:87`)**: `turn:34.47.120.225:3478` 단일 GCP VM(서울 1대)에 의존하며 **TLS/443(TURNS) 미지원**으로 기업/공공 Wi-Fi 방화벽 환경에서 통화 실패 위험이 높습니다. 또한 GCP 무료 크레딧이 **2027-01-06 만료** 예정입니다.

### P1-2. `rate_limits` 테이블 무한 누적 및 D1 운영·백업 체계 미비
- **근거**: `scripts/cf_worker.js:444`, `1290-1299`
- **결함 내용**:
  - `rateLimit()`이 분 단위 윈도우마다 `rate_limits` 테이블에 행을 `INSERT`하지만 **만료된 행을 삭제(cleanup/TTL)하는 코드가 전혀 없습니다**. 서비스 운영 기간이 길어질수록 테이블이 무한 팽창합니다.
  - 또한 `SELECT` 후 `INSERT ... ON CONFLICT` 2단계 쿼리로 TOCTOU 경쟁 조건이 있으며, 모든 API 요청마다 D1 쓰기 부하를 유발합니다(Cloudflare Rate Limiting API 또는 DO/KV 기반 전환 권장).
  - D1 정기 백업 및 시점 복구(PITR) 실전 리허설 문서/자동화가 미비합니다.

### P1-3. 프로덕션 설정 및 CI/CD 릴리스 위생 결함
- **`ALLOWED_ORIGINS`에 `localhost` 잔존 (`wrangler.jsonc:51`)**: 프로덕션 환경변수에 `http://localhost:5173,http://localhost:8080`이 포함돼 있습니다. 프로덕션에서 제거해야 합니다.
- **Dirty 배포 (`source_dirty: true`)**: 실서버 `/api/v1/version`에 `source_dirty: true`가 기록돼 있어 배포 산출물과 Git 커밋 간 1:1 무결성이 깨져 있습니다.
- **Go 테스트 및 CI 불일치**: `backend/internal/db/pgsqlite_test.go:48`이 마이그레이션 8개를 기대해 현재 10개(`001~010`)와 충돌하여 `go test ./...` 실패. `.github/workflows/backend.yml:36`도 `database/00[2-6]_*.sql`만 재생하도록 하드코딩되어 `007~010` 누락.
- **CI 커버리지 공백**: `.github/workflows/`에 **Flutter `analyze`/`test`/APK 빌드 워크플로우가 전혀 없고**, `deploy-cloudflare.yml`에는 배포 후 `post_deploy_gate.mjs` 자동 검증 및 롤백 단계가 없습니다.

### P1-4. 웹 푸시(Web Push / VAPID) 미구현
- `apps/user-web/public/sw.js`는 캐시/오프라인 셸만 처리하며 `scripts/cf_worker.js`에 Web Push(VAPID) 구독/발송 경로가 없습니다. 데스크톱 웹이나 네이티브 앱이 없는 iOS Safari(PWA) 사용자가 브라우저를 닫으면 알림을 받을 수 없습니다.

### P1-5. 데스크톱 앱 (`desktop/user-desktop`) 미완성
- `desktop/user-desktop/src-tauri/tauri.conf.json`: `"productName": "Open Messenger"`, `"identifier": "com.openscanner.messenger"`, `"csp": null`. 브랜드·보안 CSP·코드 서명(Windows Authenticode / macOS Notarization)·자동 업데이트·빌드 CI가 모두 미구축 상태입니다.

### P1-6. 하드코딩 샘플 콘텐츠·운영 만료 항목·상표권 리스크
- **뉴스 탭 (`scripts/cf_worker.js:2252, 6503`)**: `NEWS_SAMPLE` 정적 샘플 배열을 그대로 반환합니다(실제 RSS/뉴스 피드 연동 없음). 상용 출시 시 뉴스 탭 숨김 또는 실제 피드 연동 필요.
- **봇 토큰 만료 임박**: `docs/HANDOVER_20261120.md:151` 기준 원격 작업 러너 봇 토큰이 **2026-12-15 만료** 예정.
- **상표권 미출원**: `LUNO`, `LUNO TALK`, `루노톡` 상표 선출원 미완료(유사 선행 출원 리스크 기록 존재).

### P1-7. 관측성(Observability)·실시간 장애 알림·보안 대응 체계 부재
- D1 `luno_telemetry` 테이블 적재와 `/metrics` 엔드포인트는 구현되었으나, 외부 APM/에러 수집(Sentry 등), 5xx 급증/인증 실패 폭주/워커 예외 시 즉시 경보(Slack/PagerDuty/Email), SLA/SLO 대시보드, 침해사고 대응 런북(IR Playbook)이 부재합니다.

### P1-8. 미디어 처리 및 파일 보안 한계
- 첨부 최대 10MB(`MAX_ATTACHMENT_BYTES`), MIME 허용 목록, 평문 이미지 대상 GCP Vision SafeSearch는 구현됨.
- 다만 **악성코드(AV/ClamAV) 검사**, 이미지 EXIF(GPS 위치 등) 서버 측 제거, 동영상 트랜스코딩/스트리밍(HLS), CDN 리사이징/썸네일 파이프라인이 없습니다.

### P1-9. Go 백엔드와 Cloudflare Worker 이중화 드리프트
- `backend/`(Go + PostgreSQL/SQLite)는 `route_contract.golden.json`으로 동결되어 약 20개 이상의 Worker 전용 엔드포인트(이메일 인증, E2EE 백업/기기, 그룹통화, 번역, 텔레메트리, 고객지원, 연락처 매칭 등)가 빠져 있고, `k8s/` 매니페스트도 템플릿 상태(`messenger-backend:latest`, `CHANGE_ME_TO_32_BYTE_SECRET`)입니다. 운영 백엔드를 Cloudflare로 단일화할지, Go로 이관할지 명확히 결정하고 미사용 경로를 정리해야 유지보수 혼선을 막을 수 있습니다.

---

## 6. P2 — 중장기 확장성 및 기술 부채

상용화 이후 이용자 증가에 따라 반드시 해소해야 할 구조적 과제입니다.

1. **거대 단일 파일 모놀리스 분리**:
   - `scripts/cf_worker.js`: **10,265줄 / 590KB** (단일 JS 파일에 스키마·인증·채팅·통화·E2EE·AI·콘솔·DO 전부 집중)
   - `apps/user-web/src/views/MessengerView.vue`: **4,507줄 / 195KB**
   - 도메인별 모듈 분리(라우터/서비스/리포지토리/컴포저블) 없이는 다수 개발자 협업 및 회귀 방지가 어렵습니다.
2. **Cloudflare D1 단일 SQLite 쓰기 병목 대응**:
   - D1은 단일 프라이머리 SQLite 구조이므로 대규모 동시 접속·대형 그룹방 폭주·매 요청 `rate_limits`/`luno_sessions` 갱신이 겹치면 쓰기 직렬화 병목이 발생할 수 있습니다. 부하 테스트(k6 등)로 동시 접속 한계치(CCU/TPS)를 계측하고 방 단위 Durable Object 또는 PostgreSQL/Hyperdrive 분산을 계획해야 합니다.
3. **그룹 통화 SFU 전환**: Mesh(최대 8명) → SFU(Cloudflare Calls / LiveKit)로 전환해야 상용 수준의 다자 통화 품질 확보.
4. **E2EE v2 고도화**: 보안 코드 QR 스캔, 페이징 암호화 백업(방당 200건 → 2,000건+), v2 래칫 헤더 암호화, 봇 초대 시 평문 전환 동의 UX.
5. **비즈니스 콘솔 실서비스화**: 개발자 OAuth2 Authorization Code 플로우, 광고 실시간 입찰/노출 집계, 크리에이터 심사·정산 워크플로우 완성.
6. **접근성·다중 브라우저 E2E 회귀 자동화**: Playwright 기반 크로스 브라우저(Chrome/Safari/Firefox/모바일 뷰포트) E2E CI 상시 연동.

---

## 7. 권장 상용화 로드맵 (단계별 Go-Live 전략)

한 번에 모든 기능을 상용화하기보다, **무료 메신저(Web + Android) 정식 1차 출시 → iOS & E2EE 강제 2차 출시 → 수익화/대규모 확장 3차 출시**의 3단계 전략을 권장합니다.

### Stage 1: Web + Android 무료 메신저 정식 1차 출시 (목표: 2~4주)
- [ ] **이메일·SMS 실연동** (Resend/SES + SMS 벤더) → 비번 재설정·이메일 인증·휴대폰 로그인/연락처 매칭 정상화 (P0-1)
- [ ] **법적 문서 전면 개정**: 운영사/DPO/연락처/국외이전/수탁사(FCM·R2·Google AI·TURN)/연락처 수집 반영 + 법무 검토 (P0-2)
- [ ] **Android Play Store 출시 준비**: 최종 `applicationId` 확정 → Firebase/`assetlinks.json` 서명 지문(`f2d72ccc...`) 일치 → AAB 빌드·Play App Signing → `USE_FULL_SCREEN_INTENT` 정책 선언 → 미완성 이미지 공유/샘플 뉴스/지갑·유료 UI 정리 (P0-4, P0-7, P1-6)
- [ ] **그룹 통화 `groupCallRooms` Durable Object/D1 이관** 또는 1차 출시에서 그룹 통화 기능 플래그 OFF (P0-5)
- [ ] **실기기 통화·푸시 6대 시나리오 최종 QA** 완료 (P0-8)
- [ ] **운영 위생 정리**: Cloudflare 본 계정 단일화(중계 워커 제거), `ALLOWED_ORIGINS`에서 `localhost` 제거, `rate_limits` TTL 정리 크론/전환, clean 커밋 배포(`source_dirty: false`), Flutter CI 및 `post_deploy_gate` 자동화, Go 마이그레이션 테스트 수정 (P1-1~P1-3)

### Stage 2: iOS App Store 출시 · E2EE 전면 강제 · 운영 고도화 (목표: 4~8주)
- [ ] **iOS 네이티브 완성**: Mac/Apple Developer 등록, `GoogleService-Info.plist`, APNs + PushKit + CallKit, `apple-app-site-association`, TestFlight → App Store 출시 (P0-3)
- [ ] **Web Push (VAPID)** 구현으로 데스크톱 웹 및 PWA 백그라운드 알림 지원 (P1-4)
- [ ] **E2EE 강제 전환(`E2EE_ENFORCED=true`, `APP_MIN_BUILD`)** 및 외부 보안 감사 수검 (P0-6)
- [ ] **멀티리전 TURN (TLS/443 TURNS 포함)** 구축 및 GCP 크레딧 만료(2027-01-06) 대응 (P1-1)
- [ ] **관측성 구축**: Sentry/실시간 장애 알림/D1 백업 복구 리허설/부하 테스트 (P1-7)

### Stage 3: 수익화 · 데스크톱 · 대규모 확장 (8주 이후)
- [ ] **PG / Google Play Billing / Apple IAP** 정식 연동 및 정산/환불 체계 구축 (P0-7)
- [ ] **그룹 통화 SFU(Cloudflare Calls / LiveKit)** 도입 (P2-3)
- [ ] **Desktop Tauri** 리브랜딩(`LUNO`), CSP 활성화, OS 코드 서명 및 자동 업데이트 배포 (P1-5)
- [ ] **`cf_worker.js` / `MessengerView.vue` 모놀리스 모듈화** 및 D1 쓰기 분산 아키텍처 전환 (P2-1, P2-2)

---

## 8. 최종 결론

> **현 시점(2026-11-22) LUNO Global Messenger는 "실제로 동작하는 고완성도 베타/사내·지인 파일럿 메신저" 수준까지는 도달했으나, "일반 대중 대상 정식 상용 메신저"로는 아직 준비가 끝나지 않았습니다 (조건부 NO-GO).**
>
> 코드 자체의 기능 밀도와 테스트 커버리지(Node 709 + Flutter 454 + 웹 6개 앱 빌드 녹색)는 매우 우수하므로, **Stage 1의 P0 6대 핵심 블로커(이메일/SMS 실연동, 법적 문서/DPO, Android 패키지ID·App Links·Play Store 등록, 그룹통화 다중 isolate 수정, 무료 범위 정리, 실기기 통화 QA)** 를 집중 해소하면 Web+Android 기준 정식 1차 상용 출시는 단기간(2~4주) 내 충분히 달성 가능합니다.
