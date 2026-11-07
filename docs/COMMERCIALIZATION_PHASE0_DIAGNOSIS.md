# 상용화 Phase 0 — 현황 진단 보고서

- 대상: LUNO Global Messenger (본 저장소 전체)
- 일자: 2026-11-07 / 커밋 `2fa7f86`
- 방법: 4면 감사 에이전트(웹·백엔드·DB·모바일) 전수 조사 + 합성, 핵심 불일치는 직접 재검증
- 상태 정의: working=실제 API 배선, partial=일부만 동작, dummy=하드코딩/로컬 전용, broken=호출이 실패함, missing=클라이언트가 호출하나 서버 라우트 없음

## 0. 아키텍처 실측 (프롬프트 플레이스홀더 확정)

| 항목 | 프롬프트 가정 | 실측 |
| --- | --- | --- |
| FE 상태관리 | Pinia | 없음. `activeNav` ref + v-if 분기 (단일 App.vue 약 8,290줄) |
| FE 라우터 | Vue Router | 없음. 메뉴=내부 상태, URL 분리 없음 |
| FE i18n | vue-i18n | 없음. 자작 사전(`luno-i18n.ts` + `handoff-i18n.ts` + `strings/*.json`) |
| BE 프레임워크 | Gin/Echo/Fiber 중 택1 | 셋 다 아님. Go 표준 `net/http` + `http.ServeMux` |
| BE 확장 | — | gorilla/websocket, pgx/v5, modernc sqlite |
| App 상태관리 | Riverpod/Bloc 중 택1 | 셋 다 아님. `ChangeNotifier` + `InheritedNotifier` 자작 |
| App 라우터 | go_router | go_router 24 라우트 (정상) |
| DB | — | PostgreSQL 14스키마 97테이블, 시드 데이터 0건 |

## 1. 화면 인벤토리 — user-web (29개)

| 화면/모달 | 상태 | 근거 |
| --- | --- | --- |
| 로그인/회원가입/QR/전화/데모 | working | App.vue:2847 (auth API 배선) |
| 홈·친구 | working | App.vue:3263 |
| 대화 목록·메시지 | working | App.vue:3452 |
| 대화 서랍(노트/앨범/일정/미디어/투표) | working | App.vue:571 |
| 뉴스 | partial | App.vue:3555 — 샘플 콘텐츠 표기 |
| 뉴스 리더 모달 | partial | App.vue:4444 — 북마크/공유 로컬 전용 |
| 통화 | working | App.vue:3660 — 서버 원장 기반 |
| VOOM·스토리 | working | App.vue:3717 |
| 오픈채팅 | working | App.vue:3751 |
| 지갑 조회 | working | App.vue:3768 |
| 스티커 피커 | partial | App.vue:4254 — 카탈로그 로컬 상수 |
| 리치메뉴 | working | App.vue:532 |
| 친구 프로필 | working | App.vue:156 |
| 내 프로필(사진 변경·삭제 포함) | working | App.vue:4567 — PATCH /api/v1/me 배선 |
| QR 모달 | dummy | App.vue:4424 — 정적 아이콘, 생성 없음 |
| Keep 모달 | working | App.vue:4603 |
| 송금 모달 | working | App.vue:4631 |
| 충전 모달 | broken | App.vue:4661 — 버튼 전부 비활성화(PG 미연동) |
| 투표·일정 생성 모달 | working | App.vue:4681/4705 |
| 설정 모달 | working | App.vue:4727 (단, 내보내기/탈퇴 호출은 §4 불일치) |
| 연락처 공유·비밀번호 변경·스토리/VOOM/오픈채팅/그룹 생성·새 대화 | working | App.vue:4890~5040 (단, 비밀번호 변경 호출은 §4 불일치) |
| 친구 추가 모달 | partial | App.vue:5006 — QR/초대 카드는 정적 |
| 에코시스템 허브 모달 | dummy | App.vue:5087 — 하드코딩 목록 |

## 2. 화면 인벤토리 — 5개 콘솔 (25개)

| 콘솔 | working | partial |
| --- | --- | --- |
| admin (6) | 로그인, 대시보드 지표, 회원 관리·제재, 신고 처리, 기능 플래그, 감사 로그 | — |
| partner (7) | 로그인, 조직, 계정, 리치메뉴 디자이너, 티켓 | 봇룰 시뮬레이터(로컬 매칭), 캠페인/쿠폰(목록 미표시) |
| developer (5) | 로그인, 조직, API 앱, 웹훅, 미니앱 | — |
| creator (5) | 로그인, 프로필, 팩, 스티커 자산, 정산 | — |
| ads (4) | 로그인·조직, 광고주, 캠페인 | 광고그룹(타게팅 하드코딩, 목록 없음) |

## 3. 화면 인벤토리 — Flutter 앱 (24 라우트)

21개 working(로그인·홈·스토리·채널·대화·보관함 4종·피드·라운지·통화·지갑·Keep·관리자 5종),
3개 partial(뉴스, 뉴스 상세, 설정-번역/레터실링 토글 로컬 전용),
1개 dummy(`/more` 정적 목차).
`lib/state/session.dart`가 단일 세션 컨트롤러. 기본 API 베이스가 상용 URL로 하드코딩됨(`legacy_tokens.dart:40`, `--dart-define API_URL`로 교체 가능).

## 4. 클라이언트-서버 불일치 (P0 핵심)

| # | 클라이언트 호출 | 서버 실측 | 영향 |
| --- | --- | --- | --- |
| 1 | `POST /api/v1/auth/change-password` (웹:486) | `PATCH /api/v1/auth/password` (core.go:328) | 비밀번호 변경 실패 |
| 2 | `GET /api/v1/bookmarks` + `POST` (앱:194,478) | `GET/POST/DELETE /api/v1/saved-messages`만 존재 | 앱 Keep 항상 빈 목록 (에러 삼킴) |
| 3 | `POST /api/v1/translate` (앱:434) | 라우트 없음 (게이트 allowlist 404) | 앱 번역 실패 |
| 4 | `GET /api/v1/me/export-data` (웹:2608, 앱:525) | 라우트 없음 | 내보내기 실패 |
| 5 | `POST /api/v1/me/delete-account` (웹:2623) | `DELETE /api/v1/me`만 존재 | 탈퇴 실패 |
| 6 | `POST /api/v1/auth/sessions/revoke` | 라우트 없음 | 세션 강제종료 실패 |
| 7 | `GET /conversations/{id}/rich-menu` (웹:539) | 라우트 없음 | 리치메뉴 미표시 (조용히 null) |
| 8 | `PATCH /api/v1/friends/{id}` (즐겨찾기/차단) | `POST/DELETE /blocks`, friends는 POST/DELETE만 | 즐겨찾기·차단 실패 |
| 9 | `PATCH /conversations/{id}/meta` (고정/음소거) | 라우트 없음 | 고정·음소거 실패 |
| 10 | `POST /conversations/read-all` | 라우트 없음 | 전체 읽음 실패 |
| 11 | `DELETE /conversations/{id}` | 라우트 없음 | 대화방 나가기 실패 |
| 12 | `POST /auth/phone/send-code`, `/verify` | 라우트 없음 | 전화 로그인 실패 |
| 13 | `POST /auth/demo` | 라우트 없음(Go; 워커에만 존재) | Go 직결 시 데모 실패 |
| 14 | `POST /push-tokens/test` | `POST /push/test`만 존재 | 푸시 테스트 실패 |
| 15 | partner `rich-menus` GET, `bot-rules` GET/POST/DELETE | 라우트 없음 | 콘솔 일부 실패 |
| 16 | `POST /api/v1/store/orders` | 503 fail-closed (의도된 봉인) | PG 계약 전까지 정상(봉인) |

## 5. API 라우트 전수 (149건, core.go:276~499)

전 라우트가 `Handler()`에 집중. 인증 미들웨어(JWT+세션+역할), CORS allowlist+보안 헤더,
인메모리 레이트리밋(60req/min) 적용. DB 미사용 stub/정적 응답은 9건:
`GET /healthz`, `GET /readyz`, `GET /services`, `GET /version`,
`GET /push/credentials`, `GET /push/health`, `POST /store/orders`(503),
`GET /news`(샘플), `ANY /`(404 분기). `POST /conversations/{id}/typing`은 인메모리.
나머지 139건은 표에 매핑된 실동작 라우트. 상세 행은 감사 원본(합성 ref `resolved result 2`) 참조.

## 6. DB 전수 (97테이블, 001이 전체 정의)

identity 6, social 4, chat 19, realtime 7, calling 4, crypto 4, community 7,
business 11, developer 7, creator 6, commerce 9, ads 5, safety 3, ops 5.
002~005 마이그레이션은 신규 DB 기준 중복 정의(IF NOT EXISTS/ALTER, 기존 DB에만 유효).
시드/데모 행 0건. 테이블별 DDL은 감사 원본(`resolved result 1`) 참조.

## 7. 구조적 결함·데드코드

1. 메뉴=URL=파일 분리 원칙 위반: 웹 6개 앱 전부 라우터 없음. Phase 1~2에서 vue-router 도입 + App.vue 분할 필요(최대 공사).
2. 데드 내비게이션: `add-friends/open-search/open-mail/open-apps/open-video/open-stream/open-services`가 NavItem에 있으나 호출부·화면 없음(App.vue:142).
3. 미사용 뷰 import 잔재: HomeView/ChatsView/VoomView/WalletView/OpenChatView/ChatRoomView.
4. 다국어: en/th/ja 9개 원시 키 누출, 템플릿 하드코딩 CJK 795개, 브랜드명 로케일별 상이, AI 번역은 5문장 코퍼스+정규식(기 감사 확정).
5. 검색: LIKE 기반(`/search` + 대화내 검색). FTS/외부엔진 없음. 자동완성 API·UI 없음.
6. 반응형: 웹은 1100/800/768/700/480px 미디어쿼리(1440/1280/1024/390/360 미지정), 콘솔은 800/700px만. 앱은 400/720/1120 브레이크포인트 존재.
7. 앱 기본 API가 상용 URL 하드코딩 — 개발 빌드 오접속 주의.

## 8. P0 갭 목록 (Phase 2 대상)

G1. §4의 1~15번 불일치 해소 (서버 추가 vs 클라이언트 교정, 건별 판단)
G2. vue-router 도입 + App.vue 화면 분리 (URL 독립)
G3. 다국어 누출 9건 + 브랜드명 통일 + 하드코딩 분리 착수
G4. 충전/PG·SMS·소셜로그인·E2EE 실배선은 외부 계약 영역 → 보고서에만 정리(§11 준수, 구현 금지)
G5. 검색 자동완성 API+UI, SEO/사이트맵(웹), 접근성 대비AA 검수

## 9. 가정 목록 (미션 지시: 질문 대신 가정 후 기록)

A1. 프로젝트명=LUNO Global Messenger, [Gin/Echo/Fiber]는 해당 없음(stdlib 유지).
A2. 메신저 특성상 SEO·PG 상품주문 등 쇼핑몰형 항목은 축소 적용, 대신 메시지·통화·E2EE·푸시에 가중.
A3. 계약·결제(PG/SMS/검색클라우드/번역API/도메인)는 일절 진행하지 않고 보고서 비교표까지만 작성.
A4. 디자인 시스템은 기존 v2/v3 토큰을 승계하고 부족분만 보완 (전면 교체 아님).
A5. 스크린샷은 Playwright(웹 7종) + Flutter 테스트 스크린샷으로 실측, 실기기 캡처는 제외하고 보고서에 명기.

— 끝 —
