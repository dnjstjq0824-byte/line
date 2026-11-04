# LUNO Design v2 — 구현·검증·배포 기록

기준일: 2026-11-05 KST. 후속 사용자 지시로 T-2 이후 전체 디자인 진행, 프로필 포함, Git 커밋/푸시, 자동 운영 배포가 승인되었다. 원래 LN6 디자인 및 인계 파일은 보존했고 원본을 수정하지 않았다. API·DB 스키마·서버 메시지/결제 로직은 이번 디자인 변경에 포함하지 않았다.

## 디자인 변경

v2 이름은 **Quiet connection**이다. 인디고 브랜드를 유지하면서 표면·텍스트·테두리·상태·포커스를 의미 기반 토큰으로 정리했다. CSS와 JSON을 별도 v2 파일로 관리한다.

| 영역 | 기존 | v2 |
|---|---|---|
| 브랜드 | 이전 Open Messenger/Orbit 자산 혼재 | 전달받은 final horizontal/appicon을 웹 로그인·빈 화면·콘솔·favicon·앱 아이콘 및 Flutter 로그인에 사용 |
| 라이트 | 서로 다른 블루·네이비·카드 스타일 | accent #4B4DED / background #F5F6FA / surface #FFFFFF / text #202333 |
| 다크 | 화면별 불완전한 색상 전환 | 별도 의미 토큰: accent #A3A4FF / background #11131C / surface #1A1D29 / text #EEEEF7 |
| 타이포·간격 | 화면별 개별 값 | 공통 폰트 스택, 4/8 기반 간격, 제어12px·카드18px·프로필24px 반경 |
| 로그인 | OS 창 모방, 정적 QR 패턴 | 반응형 카드, 명확한 입력·포커스, 지원되지 않는 QR 표시를 준비 상태로 구분 |
| 메신저 | 밀집 탐색·하드코딩 표면 | 공통 레일·목록·대화 표면, 낮은 높이의 레일 스크롤, 모바일 전폭 목록 및 태블릿 분할 |
| 프로필 | 본인과 상대방의 동일한 행동 목록 | 본인: 편집/계정 보안. 상대방: 기존 대화/통화/송금. 실제 사진 URL 또는 이니셜, 실제 ID/이메일만 표시 |
| 콘솔 | 5종 별도 스타일 | 공통 토큰·로그인·폼·표·내비게이션·테마 제어. 업무 기능은 추가하지 않음 |
| Flutter | 단일 라이트 ThemeData | 별도 LunoDesignV2의 light/dark/system 테마 및 확정 로그인 로고 |

기존 모든 개별 화면을 새 컴포넌트로 전면 재작성한 것은 아니다. 현재 구현된 웹 화면은 공통 스타일 및 기존 컴포넌트 위에서 재설계했다. Flutter는 테마와 인증 표면을 갱신했으며 기존 각 위젯의 하드코딩 색상까지 전수 교체하지 않았다. 따라서 네이티브 앱의 모든 화면 다크 QA 완료를 주장하지 않는다.

## D3 문자열 확인

정본 ko/en 169개 키를 내용 변경 없이 공유 리소스로 복사했다. 양쪽 키 수·키 집합·빈 문자열 부재를 검사했다. 기존 화면 키를 정본 키에 연결하는 호환 계층과 새 디자인용 ko/en 리소스를 추가했다. 신규 디자인 문자열은 ko/en이 함께 존재하며 그 외 언어의 해당 키는 en으로 폴백한다.

169개 전체가 현재 모든 제품 화면에 연결되었다고 주장하지 않는다. 기존 화면의 하드코딩 문구와 catalog/doc 전수 문자열은 아직 남아 있다. 이번 연결 범위는 인증 핵심 레이블, 내비게이션 일부, 프로필 핵심 행동 및 신규 디자인 안내다. 문서 안의 프로토타입 전용 문구는 실제 서비스 안내로 무조건 노출하지 않았다.

## 프로필 및 정직한 상태 표시

- 자신의 프로필에서 편집과 기존 비밀번호 변경 화면으로 연결된다. 친구 프로필의 기존 대화/통화/송금 동작은 유지했다.
- 이름·ID·소개는 기존 PATCH /me를 통해 저장한다. Go에는 없는 status_message 필드를 보내던 기존 프런트 호환성 문제를 수정했다. 응답에 그 필드가 있는 경우에만 보내므로 Worker의 기존 계약은 유지한다. 실제 Go/SQLite에서 PATCH 200과 저장된 bio를 확인했다.
- 사진 URL이 있으면 표시한다. 사진 업로드·크롭·공개 범위 편집은 새 서버 기능을 만들지 않고 준비 상태로 명시했다. 해당 부분의 완성이나 운영 동작을 주장하지 않는다.
- 정적 QR 패턴을 실제 QR처럼 노출하지 않는다. QR UI는 준비 상태이며 기존 자동 challenge/poll 시작을 제거했다. 이메일 인증 흐름은 유지했다. 서버의 QR API 자체를 변경하지 않았다.
- 비밀번호 찾기가 발송 성공을 만들어내던 안내, 확인되지 않은 보안 활성화/Double Ratchet 문구, 고정 빌드 날짜 폴백, 허구의 게임 라이선스 배너를 정정했다. 데모 계정 자체는 삭제하거나 재정의하지 않았다.

## 실제 검증 결과

| 검사 | 결과·범위 |
|---|---|
| 6개 웹 워크스페이스 vue-tsc + Vite | PASS |
| Node 테스트 | 47개 PASS: 기존 Worker 44개 + 대비/문자열/토큰 3개 |
| WCAG AA 계산 | light/dark의 text/surface, muted/surface, muted/bg, on-accent/accent 모두 4.5 이상. 모든 개별 화면의 모든 색상 조합 인증은 아님 |
| Flutter analyze | 오류 없음 |
| Flutter test | 기존 4개 PASS |
| 로컬 실제 로그인 | PASS. 실제 Go 서버 + 임시 SQLite 계정, 모의 API 응답 사용 안 함 |
| 로컬 실제 프로필 저장 | PATCH /me 200, 저장된 bio 확인 |
| Light/Dark × 390/768/1024/1440 | 8개 조합 PASS. 실제 innerWidth와 scrollWidth 일치, 가로 넘침 없음. 390px 목록 폭390, 768px 목록310, 1024/1440 목록340 |
| 콘솔 5종 | 실제 빌드 로그인 화면, 390px 가로 넘침 없음, Light/Dark 버튼 상태 전환 PASS |
| Git diff 공백 검사 / 편집기 진단 | PASS |

초기 QA에서 프로필 저장이 실패했고, Go가 받지 않는 status_message를 보내는 원인을 확인하여 수정했다. 초기 고정 폭 검사는 애니메이션 도중의 너비를 읽어 실패했으며, 전환 완료 후 측정하는 최종 실행은 통과했다. 실패를 PASS로 바꾸어 기록하지 않았다.

시각 QA는 임시 Playwright/Edge로 고정 해상도를 사용했다. 통합 브라우저는 계속 열어 사용자에게 작업 화면을 보여주었다. 캡처와 원 실행 결과는 Git 제외 작업 폴더에 있다:

- [.vscode/luno-visual-qa-results.json](../.vscode/luno-visual-qa-results.json)
- [로그인](../.vscode/luno-qa-login.png), [본인 프로필](../.vscode/luno-qa-own-profile.png), [다크 설정](../.vscode/luno-qa-settings-dark.png)
- [390px 라이트](../.vscode/luno-qa-light-390.png), [390px 다크](../.vscode/luno-qa-dark-390.png), [1440px 라이트](../.vscode/luno-qa-light-1440.png)
- [Admin](../.vscode/luno-qa-console-admin.png), [Partner](../.vscode/luno-qa-console-partner.png), [Developer](../.vscode/luno-qa-console-developer.png), [Creator](../.vscode/luno-qa-console-creator.png), [Ads](../.vscode/luno-qa-console-ads.png)

캡처·빌드·임시 QA 패키지·DB·인계 작업 복사본은 커밋하지 않는다. 로컬 캡처 링크는 이 작업 폴더에만 존재하며 GitHub에서 열린 보고서에서는 제공되지 않는다.

## 미구현·검증 한계

2FA/백업 코드 등 S1과 현행 사이에 미구현인 기능, 사진 편집/공개 범위, P2/P3/P4 신규 기능과 DG-1~DG-5의 미결정 항목은 디자인 적용으로 완성된 것으로 보지 않는다. API·DB 마이그레이션·결제·광고 실레일·푸시 실전송을 추가하지 않았다. 네이티브 실제 기기, 모든 확장 화면의 전수 클릭, 역할별 인증 후 콘솔 업무, 실제 통화 품질은 NOT TESTED다. 네이티브 릴리스 APK는 생성/서명/배포하지 않았다.

## 변경 파일 매핑

신규: 공유 v2 CSS/JSON 토큰, ThemeToggle 컴포넌트, 확정 SVG 2개, 정본 ko/en JSON 및 추가 디자인 JSON, 문자열 호환 모듈, 웹 v2 스타일, Flutter v2 테마와 확정 PNG, 디자인 검사 스크립트, 본 보고서.

수정: 웹/콘솔 6종 진입점과 Vue 화면, favicon/app icon, Flutter main/pubspec, Wrangler의 정확한 운영 호스트 허용 목록. 삭제 파일 없음. 변경 파일은 단계 상한 50개 이내다.

| 경로 묶음 | 대응·사유 |
|---|---|
| apps/shared/strings/*, handoff-i18n.ts | T-3 정본 리소스 확인·핵심 키 연결 |
| apps/shared/design-v2.*, LunoThemeToggle.vue, brand/* | T-4 새 버전 디자인 시스템·확정 로고 |
| apps/user-web/src/App.vue, main.ts, styles/luno-v2.css | T-4 셸·인증·프로필 및 현행 화면 시각 정리 |
| apps/user-web/public/brand/luno-{favicon,app-icon}.svg | T-4 확정 아이콘 |
| apps/*-console/src/{App.vue,main.ts} | 사용자 전체 재설계 추가 승인: 기존 콘솔의 표현·테마만 변경. P4 업무 구현 아님 |
| mobile/flutter_app/lib/{main,luno_design_v2}.dart, pubspec.yaml, assets/brand/* | T-4 네이티브 테마·인증 로고 |
| scripts/design_v2.test.mjs | 대비·정본 키·CSS/JSON 토큰 검증 |
| scripts/cf_worker.test.mjs | 사용자가 이미 수정한 테스트 보존. 글로벌 복구·만료 경계·정확한 호스트 매칭 회귀 검증, 별도 커밋 |
| wrangler.jsonc | 승인된 배포에서 기존 운영 호스트만 명시 허용하여 API 503 회귀 예방. 데모 존폐 정책 변경 없음 |

이전 T-0/T-1/T-2 산출물 4개는 기존 상태로 보존하고 이번 코드 커밋에 포함하지 않는다. Git 제외 입력 복사본 31개도 제품 변경 수에 넣지 않는다. 정확한 코드 변경 목록과 줄 수는 전달 커밋의 git show --stat로 확인한다.

## 배포 절차

사용자가 커밋·푸시와 자동 운영 배포를 명시 승인했다. 감사 브랜치에 커밋/푸시한 후 GitHub의 기존 Deploy to Cloudflare Workers 워크플로를 해당 ref로 실행한다. 이 워크플로는 전체 Node 테스트와 Vue 빌드를 먼저 수행한다. main을 강제 덮어쓰거나 운영 DB 마이그레이션을 실행하지 않는다.

현재 운영의 standalone 동작은 정확한 호스트 `line-messenger.dnjstjqppk.workers.dev`에 한해 명시적으로 허용한다. 다른 공개 호스트는 계속 fail-closed다. USER_HUB/Durable Object 바인딩은 추가하지 않았다. 배포 전 rollback 앵커는 이전 Worker 버전 목록에서 재확인하고, 성공 후 /api/v1/version의 전체 commit과 전달 커밋을 대조한다. 최종 SHA·자동 배포 실행 결과는 최종 응답에 기록한다.
