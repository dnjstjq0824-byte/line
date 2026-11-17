# Muse Spark 작업지시서 — 자동 진행용 (2026-11-16)

러너의 자동 진행(`/auto`)이 이 파일을 읽고 **"- [ ]" 카드를 위에서부터 하나씩** 맡긴다.
한 차례에 카드 하나만 끝내고, 끝낸 카드는 "- [x]"로 바꾼 뒤 같은 줄 끝에 한 줄 결과를 적는다.
남은 카드가 없으면 마지막 답 첫 줄에 `AUTOPILOT_DONE`.

## 공통 규칙 (모든 카드)

- 자세한 요구사항은 `docs/work_20261113.md`의 같은 번호 카드, 인계는 `docs/HANDOVER_20261115.md`를 따른다.
- 로컬 구현과 로컬 테스트까지만 한다. `git push`, `npm run deploy`, `wrangler`, 원격 D1, APK 빌드·릴리스는 하지 않는다.
- 수정 금지: `wrangler.jsonc`, `.github/**`, `*.jks`, `key.properties`, `.env*`, `scripts/migrations/**`.
- 끝내기 전에 바뀐 쪽의 테스트를 모두 통과시킨다.
  - 서버·웹: `node --test "scripts/*.test.mjs"` (웹을 바꿨으면 `cd apps/user-web && npx vue-tsc --noEmit`도)
  - 앱: `cd mobile/flutter_app && flutter analyze && flutter test`
  - 러너: `cd tools/pc-agent && node --test "test/*.test.mjs"`
- 웹 스타일은 `apps/user-web/src/styles/luno-v2.css` 끝(lx-* 셸)에만 더한다. main.ts에 css import를 늘리지 않는다.
- 앱 크기·글자는 `HarborType`/`HarborRadius` 상수만 쓴다. ARB 키를 지우거나 안 쓰는 키를 남기지 않는다.
- 새 사용자 문구는 ko/en/th/ja 네 언어 모두 넣는다.
- 법적 값(보관 기간 등)은 임시값을 상수 한 곳에 두고 결과 줄에 "임시값"이라고 적는다.
- 판단이 필요한 곳은 가장 보수적으로 최소한만 바꾸고 결과 줄에 적는다. 사람에게 되묻지 않는다.

## 카드

- [x] **A1 F25 웹 접근성 마무리** — `f25f591`의 axe 하네스로 로그인·채팅 목록·대화방·친구·더보기 화면을 검사해 위반 0으로 만든다. 아이콘 버튼 aria-label, 포커스 순서, 대비 AA, 새 메시지 `aria-live` 안내. 완료: axe 위반 0을 확인하는 테스트(`scripts/`)가 통과. → 완료: 아이콘 버튼 전체에 aria-label·스킵링크·aria-live·포커스 가시화 적용, axe_scan 5화면(chats/room/friends/more) 확장, scripts/f25_accessibility.test.mjs 7/7 통과(전체 스위트·vue-tsc·실브라우저 axe는 셸 장애로 러너 확인 필요).
- [x] **A2 F25 앱 접근성 마무리** — 아이콘 버튼 Semantics/tooltip, 글자 크기 200%(textScaler 2.0)에서 홈·채팅·채팅방·통화·뉴스·더보기·설정이 overflow 없이 그려진다. 완료: 360px·textScaler 2.0 위젯 테스트 추가, `flutter test` 통과. → 완료: f25_text_scale_test 14/14·전체 flutter 371/371 통과, 탭바가 본문을 0 높이로 누르던 결함 수정(축소 래핑+패딩).
- [x] **A3 F30 고객 문의 — 서버·관리자** — D1 테이블(런타임 스키마, `CREATE TABLE IF NOT EXISTS`), `POST /api/v1/support/tickets`(분류·내용·앱 버전·기기 정보, 첨부 id 선택), 내 문의 목록, 관리자 목록·답변 API. 답변 시 공식 계정 메시지로 전달. 완료: 문의→답변→내 목록에 답변 표시 E2E 테스트 통과. → 완료: scripts 560/560·pc-agent 23/23·vue-tsc·flutter 371/371+analyze 전부 통과, 문의→답변→공식방·푸시·감사 E2E 그린.
- [x] **A4 F30 고객 문의 — 웹** — 설정 창에 "문의하기"(분류·내용·제출)와 내 문의 목록(답변 표시). 완료: 컴포넌트 존재·API 호출을 핀하는 테스트, vue-tsc 통과. → 완료: scripts 564/564·pc-agent 23/23·vue-tsc·flutter 371/371 통과, 설정 문의 폼+내역 4로케일, 기존 클래스만 재사용(CSS 추가 없음).
- [x] **A5 F30 고객 문의 — 앱** — 설정 > 문의하기 화면(분류·내용·제출, 앱 버전 자동 포함)과 내 문의 목록. 완료: 위젯 테스트(제출 요청 경로·본문 확인), `flutter test` 통과. → 완료: flutter 374/374+analyze·scripts 564/564·pc-agent 23/23·vue-tsc 통과, /support 화면+ARB 15키×4로케일 전부 사용.
- [x] **A6 F29 불법·유해 콘텐츠 대응 — 서버** — 신고 분류에 불법촬영물·아동 성착취물·스팸·폭력 추가, 관리자 "즉시 비공개" API, 삭제한 첨부의 SHA-256을 차단 목록에 넣어 같은 파일 재업로드 거부, 모든 조치 감사 로그. 완료: 재업로드 거부·비공개·감사 로그 테스트 통과. → 완료: scripts 569/569·pc-agent 23/23·vue-tsc·flutter 374/374 통과, 7종 분류 검증+비공개/해제+첨부 차단(메시지·동기화·검색·피드·오픈채팅 반영) 전부 감사 기록.
- [x] **A7 F29 — 관리자 콘솔·앱/웹 신고 화면** — 관리자 콘솔 신고 목록 맨 위에 새 분류를 띄우고 즉시 비공개 버튼. 웹·앱 신고 시트에 새 분류 선택지. 완료: 관리자 콘솔 빌드(`npm run build --workspace` 해당 콘솔) 통과, 앱·웹 테스트 통과. → 완료: 콘솔 빌드·scripts 573/573·flutter 375/375·vue-tsc 통과, 웹/앱 7종 분류, 콘솔 상단고정(신규 중증 3종만, 스팸 제외)+비공개 폼(신고에 콘텐츠ID가 없어 행별 버튼 대신 대상지정 폼).
- [x] **A8 F27 서버 주소 설정화** — 앱은 `--dart-define=API_URL`(이미 있음) 외 하드코딩 주소 0건, Worker는 env의 기준 주소 하나에서 ALLOWED_ORIGINS·다운로드 링크·assetlinks를 만든다(기본값은 지금 주소). 완료: `grep -r "dnjstjqppk.workers.dev"` 결과가 기본값 상수 한 곳(앱·Worker 각 1곳)과 테스트·문서만, 테스트 통과. → 완료: scripts 581/581·flutter 375/375·vue-tsc·콘솔빌드 통과, PUBLIC_BASE_URL 단일기준(CORS+시드+SEO스탬프), STANDALONE은 보안계약상 명시유지, 잔류=매니페스트/wrangler/package/scratch(플랫폼·도구설정).
- [ ] **A9 F28 데이터 보관·파기** — 메시지·첨부·접속 기록·감사 로그·신고·탈퇴 데이터별 보관 기간을 상수 한 곳에, 기간 지난 행을 지우는 정리 함수와 관리자 실행 API(크론 추가 금지). 완료: 기간 지난 행만 지워지는 테스트 통과, 결과 줄에 "임시값" 표기.
- [ ] **A10 F26 연락처로 친구 찾기 — 서버** — 기본 꺼짐. 동의 기록 API, E.164 번호 배열을 받아 휴대폰 인증을 마친 사용자와만 대조하고 올라온 번호는 저장·로그하지 않는다. 휴대폰 인증 기능이 꺼져 있으면 503과 안내. 완료: 대조·미저장(로그·DB에 번호 없음) 테스트 통과.
- [ ] **A11 F26 — 앱 화면** — 친구 추가 화면에 "연락처로 찾기"(동의 화면 → 권한 요청 → 결과 목록). 서버가 503이면 안내만 보여 준다. 완료: 위젯 테스트(동의 전에는 요청 안 함) 통과.
- [ ] **A12 원격 작업 — 웹 PC 작업실 상태 줄·명령 칩** — 웹 대화방이 봇 방이면 입력창 위에 러너 상태(준비됨/작업 중/오프라인, `conversations/:id/bots`)와 칩 `/status` `/git` `/check` `/continue` `/auto off`. 앱의 `pc_agent_bar.dart`와 같은 동작. 완료: 웹 테스트로 칩 5개와 상태 API 호출 핀, vue-tsc 통과.

## 이번 자동 진행에서 하지 않는 것

- E2EE(F11, 마스터 지시서 6장): 설계 결정이 필요해 사람이 따로 지시한다.
- 실서버 배포, APK 릴리스, 원격 DB 작업, 도메인·결제·푸시 키 설정(대표 조치 목록).
