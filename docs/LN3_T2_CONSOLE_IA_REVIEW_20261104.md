# T-2 / D2 콘솔 IA 대조 보고

2026-11-04. 기준: 작업 복사본의 LN5 S5, K2, K1의 단계별 검수 조건. 제품 코드 수정 0개. 운영 로그인·제재·설정 변경·DB 변경·배포 없음. 판정은 구현 존재 대조와 실제 동작 검증을 구분한다.

## 승인 기록 반영

PO 후속 지시에 따라 기존 17개 경로 차이는 해소되었다. 같은 사유로 작업을 중단하거나 재승인을 요청하지 않는다. T-0의 운영 커밋 차이, Worker 롤백 앵커의 한계, DB 복원 미검증은 이전 보고대로 유지한다. T-1은 설계나 마이그레이션 승인으로 확대 해석하지 않는다.

원본 ZIP은 보존했다. 별도 작업 복사본 [.vscode/luno-handoff-20261104/](../.vscode/luno-handoff-20261104/)에 31개 파일을 기준 경로로 매핑했다. 각 파일 전체 SHA-256과 바이트를 기존 실측값에 대조하여 31/31 일치했다. ZIP 복사 전후 SHA-256은 `01c555f2e2ea9c621a69a0cefef8bdb0b952244e3a1e49d94e39a644eebeaf38`로 같다. 실행 UTC `2026-11-04T10:58:09.8983744Z`. 작업 복사본은 Git 제외 경로이며 원본 내용은 변경하지 않았다.

추가 재설계 지시는 디자인 동결에 우선한다. LN6·기존 토큰은 변경하지 않은 참고 원본으로 보존한다. 새 토큰은 별도 버전과 비교표로 관리할 예정이다. 확정 logo/final 세트, S1~S7, T-2/T-3 검수, T-4/T-5 기능 범위, P2/P3/P4 및 DG 보류 조건은 유지한다.

## 조사·증거 범위

- [Admin 소스](../apps/admin-console/src/App.vue) 전체와 요청 연결, [공유 API 클라이언트](../apps/shared/api.ts), [Go 권한 라우터](../backend/internal/server/core.go#L425), [Worker Admin 처리](../scripts/cf_worker.js#L2393)를 읽었다.
- Partner/Developer/Creator/Ads는 구현 존재만 조사했다. 개별 기능 완성도·권한·소속 격리 일치를 판정하지 않았다.
- 공개 5개 콘솔 HTML 및 각 HTML이 참조하는 JS를 GET으로 확인했다. 전부 HTTP 200, app 마운트 및 콘솔 식별 문구를 확인했다. 동일한 SPA fallback만 보고 존재를 선언하지 않도록 콘솔별 다른 JS 경로도 확인했다.
- 실제 브라우저에서 운영 Admin 로그인 화면 렌더를 확인했다. 로그인하지 않았다. 인증 후 Admin 화면은 소스 대조이며 실제 클릭 검증은 NOT TESTED다.
- 정본 작업 복사본을 별도 브라우저에 열었다. 이는 시안/프로토타입이며 운영 기능 성공 증거가 아니다.

### 공개 GET 실행 기록

호스트는 `https://line-messenger.dnjstjqppk.workers.dev`이다. 아래 페이지/JS는 각각 HTTP 200이었다.

| UTC 측정 시각 | 페이지 | 연결 JS | 페이지 CF-Ray |
|---|---|---|---|
| 10:58:40.6912861 | /admin/ | /admin/assets/index-D7HtgP0h.js | a5531ad0889585bb-HKG |
| 10:58:41.8503652 | /partner/ | /partner/assets/index-CkyV6D6e.js | a5531ad8884785bb-HKG |
| 10:58:43.0043391 | /developer/ | /developer/assets/index-Tw_uQX8J.js | a5531adf8f3b85bb-HKG |
| 10:58:44.3434608 | /creator/ | /creator/assets/index-DAIV0_qF.js | a5531ae6bce485bb-HKG |
| 10:58:45.5054313 | /ads/ | /ads/assets/index-DO3Z_JMb.js | a5531aef1bb585bb-HKG |

실행 절차: Invoke-WebRequest GET HTML → HTML script src 추출 → 같은 origin의 JS GET → HTTP/app mount/콘솔 문구 확인. API 쓰기 요청은 하지 않았다. 스크린샷 파일은 생성하지 않았으며 브라우저 렌더 확인을 캡처 산출물로 표시하지 않는다.

## Admin 현행 IA

실제 소스는 하나의 로그인 페이지와, 토큰이 있을 때 표시하는 단일 관리 페이지다. 상단 링크는 메신저와 5개 콘솔을 오가는 외부 앱 탐색이며 Admin 내부 업무 메뉴가 아니다. 로그인 후 대시보드·회원/제재·신고·플래그·감사 로그가 한 페이지에 배치된다.

| S5 Admin 항목 | 현재 구현 | 대조 결과·근거 |
|---|---|---|
| 대시보드 / 실집계 | 지표 카드, stats GET | PARTIAL. UI 존재. Worker는 Map/배열 집계이고 Go는 SQL 집계. 같은 실집계로 판정할 수 없음. [UI](../apps/admin-console/src/App.vue#L107), [Worker](../scripts/cf_worker.js#L2395), [Go](../backend/internal/server/admin.go#L12) |
| 회원 조회·검색 | 회원 목록 표 | PARTIAL. 목록은 존재, 검색 입력·회원 상세 진입 없음. [UI](../apps/admin-console/src/App.vue#L119) |
| 회원 경고·정지·해제 | 목록 행 버튼 | PARTIAL. 버튼과 요청 존재. subject_user_id / activate 사용, S1 target_user_id / reinstate와 차이. 실제 상태·목록·로그 동시 반영 NOT TESTED. [동작](../apps/admin-console/src/App.vue#L44), [UI](../apps/admin-console/src/App.vue#L133) |
| 강제 세션 종료 | 대상 회원 세션 목록/종료 UI 없음 | MISSING. 상단 로그아웃은 본인 로컬 token만 비우므로 이 기능이 아님. [로그아웃](../apps/admin-console/src/App.vue#L83) |
| 신고 처리 | 신고 목록, 정지·기각 버튼 | PARTIAL. 전용 상세/검토/해결 흐름 없음. moderation API 재사용. [UI](../apps/admin-console/src/App.vue#L143) |
| 기능 플래그 | 키 입력·enabled·추가/수정·목록 | PARTIAL. PUT 호출 있음. 효과와 감사·영속 NOT TESTED. 목록의 각 항목 직접 토글은 없음. [UI](../apps/admin-console/src/App.vue#L157), [요청](../apps/admin-console/src/App.vue#L57) |
| 감사 로그 전체 | 시간/관리자/작업/대상 표 | PARTIAL. 표는 있으나 필터·페이지·전체 데이터 여부 미검증. “불변” 문구 자체는 불변성 증거가 아님. [UI](../apps/admin-console/src/App.vue#L172) |
| 제휴 신청 심사 | 해당 UI 없음 | MISSING. 다른 콘솔 링크로 대체할 수 없음 |
| 공식 계정 전체 관리 | 해당 UI 없음 | MISSING |
| 정산 전체 조회 | 해당 UI 없음 | MISSING |
| 앱 전체 조회 | 해당 UI 없음 | MISSING |
| API 키 전체 조회 | 해당 UI 없음 | MISSING |
| 웹훅 설정·전송 테스트 | Admin UI 없음 | N/A. S5에서 Admin은 “—”; 제공 기능으로 만들지 않음 |
| 스티커 심사 | 해당 UI 없음 | MISSING |
| 캠페인·소재 심사 | 해당 UI 없음 | MISSING |
| 광고 잔액 수동 조정 | 해당 UI 없음 | MISSING |

S5 16행 기준: PARTIAL 6, MISSING 9, N/A 1. 이 수치는 소스상의 IA 대조이며 기능 테스트 통과 개수가 아니다. Admin IA 전체 일치 판정은 **FAIL / 미일치**다. 필요한 화면을 이 단계에서 임의 추가하지 않았다.

S5 코어 여정 “대시보드 → 회원 상세 → 제재 → 상태·목록·감사 동시 반영”은 회원 상세 단계가 없어 화면 흐름부터 미일치한다. 나머지 단계의 운영 효과는 NOT TESTED다.

### 공통 동작·권한 관찰

- 프런트는 token 존재 여부로 로그인 후 화면을 노출한다. 반환 role을 검사하는 UI 분기는 없다. 이 사실만으로 API 권한 우회가 성공한다고 주장하지 않는다.
- Worker는 admin 역할을 검사하고, Go는 platform_admin/support/moderator를 API별로 다르게 허용한다. S5 정본과 실제 역할 매핑 확인은 필요하며 이번 단계에서 정책을 변경하지 않았다.
- load는 5개 GET을 Promise.all로 불러온다. 실패 시 오류를 표시하지만 기존 metrics/users 등이 남아 오류 안내와 과거 값이 함께 표시될 수 있다. source-state 관찰이며 장애 재현 시험은 NOT TESTED다.
- 상단 로그아웃은 서버 logout 호출 없이 로컬 token을 지운다. S3 서버 세션 해지와 별개다. 이 단계에서 인증 로직을 수정하지 않았다.
- 제재 사유는 사용자가 쓰는 입력이 아니라 `Admin console <action> action` 문자열이다. S1 사유 계약·S6 문구 적용과의 차이는 후속 대조 대상이다.

## 나머지 콘솔 4종 — 존재 여부만

| 콘솔 | 현행 구현 존재 | 소스·공개 엔트리 근거 | 이번 조사에서 주장하지 않는 것 |
|---|---|---|---|
| Partner | **있음** | [App.vue](../apps/partner-console/src/App.vue#L139), main.ts/package.json, /partner/ 및 전용 JS 200 | S5 전 기능 완성·실계정 내부·소속 격리 |
| Developer | **있음** | [App.vue](../apps/developer-console/src/App.vue#L93), main.ts/package.json, /developer/ 및 전용 JS 200 | API 키·웹훅·사용량 실제 성공 |
| Creator | **있음** | [App.vue](../apps/creator-console/src/App.vue#L77), main.ts/package.json, /creator/ 및 전용 JS 200 | 업로드·심사·스토어 노출·실수익 |
| Ads | **있음** | [App.vue](../apps/ads-console/src/App.vue#L87), main.ts/package.json, /ads/ 및 전용 JS 200 | 실제 광고 집행·충전·과금·원장 |

정본 프로토타입의 F12를 실제 서비스 콘솔로 잘못 집계하지 않았다. 실제 소스와 운영 엔트리를 따로 확인했다. 4종은 “없음”에 해당하지 않지만, 존재 확인을 S5 충족이나 P4 착수 승인으로 확대하지 않는다.

## 추가 재설계 지시와 프로필 요청 반영

새 지시는 디자인 언어·토큰·컴포넌트·레이아웃의 전면 개선을 허용하되 T-2/T-3 검수와 기능·백엔드 게이트는 유지한다. 현재 단계에서는 기존 시안과 현행 소스의 분석만 병행했다. 새 디자인을 제품에 적용하지 않았다.

초기 관찰: 인계 토큰은 #4B4DED 계열인 반면 현재 웹 토큰은 #4F7CFF/#315BCD 계열이고 콘솔에는 다수 인라인 색상이 있다. 기존 토큰의 대비 검증 주석을 새 디자인 QA 결과로 인용하지 않는다. 향후 v2 토큰과 의미 기반 표면/글자/테두리/포커스 매핑, 공통 컴포넌트, PC·태블릿·390px 배치, 라이트·다크를 별도로 대조한다.

사용자의 추가 요청에 따라 프로필도 전체 디자인 인벤토리에 포함한다: 내 프로필, 편집, 다른 사용자/친구 프로필, 사진·이름·상태메시지·ID, 공개 범위·차단, 계정·보안 설정. 기존 프로필 구현은 [웹 상태 및 프로필 진입](../apps/user-web/src/App.vue#L837), [편집 흐름](../apps/user-web/src/App.vue#L2258), [Worker 프로필 처리](../scripts/cf_worker.js#L1435)를 출발점으로 조사한다. S1~S4에 없는 기능·전이는 준비 상태/명세 미정으로 구분하며 새로운 서버 동작을 만들지 않는다. 프로필 전 화면 설계·구현은 아직 미완료다.

## 실행·미실행 및 변경 매핑

- 실행: 원본/작업 복사본 SHA 검증, 5종 소스 존재 조사, Admin 16행 대조, 공개 HTML/JS GET, 브라우저 Admin 로그인 화면 및 정본 PC 시안 표시.
- NOT TESTED: 인증 후 콘솔 클릭, 실계정 role별 접근, 다른 소속 데이터 403, 제재/플래그/감사 효과, 모바일·다크 QA, 장애 재현.
- BLOCKED/보류 유지: P4 구현, 계약에 없는 콘솔 API 결정, DG/결제/광고 실연동. 제품 코드는 이 단계에서 수리하지 않았다.
- 기존 추적 파일 수정·삭제 0개, `git diff --stat` 비어 있음. 신규 보고서 1개: 본 문서 ↔ T-2/D2. 별도 승인된 입력 작업 복사본 31개는 .vscode 아래 Git 제외이며 제품 코드/새 기능이 아니다. 기존 T-0/T-1 보고 3개도 그대로 보존했다.
- Git HEAD `e9cbad40bfa6423fe0fb027235cb2e56bc85929b` 유지. 커밋·푸시·빌드·배포 없음. 테스트 코드를 새로 만들지 않았으며, 정적 조사와 GET 관찰을 자동화 기능 테스트 PASS로 보고하지 않는다.

## 단계 제출

T-2 대조 산출물 제출: Admin은 부분 구현으로 S5와 미일치, 나머지 4종은 구현 존재 확인. 결함을 미해결 상태로 숨기지 않는다. 다음은 T-3 문자열 키 적용 확인이다.

K1의 “각 산출물은 QA 검수/승인을 받아야 다음 단계의 입력이 된다”와 최신 재설계 지시 §7의 “T-2 및 T-3 단계별 검수” 유지 조건에 따라 본 T-2 결과를 PO 검수에 제출한다. 기존 경로 문제나 T-0/T-1 승인 재요청이 아니다. T-2 검수 결과가 T-3의 다음 입력이며, P4는 계속 별도 보류다.
