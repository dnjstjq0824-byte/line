# F11 E2EE 현황 보고서

작성: 2026-11-14 / 대상: Stage 10 F11 (전수 확인 후 보고)
결론: **반만 켜진 상태입니다.** 서버 키 디렉터리와 메시지 종류 배관은
있고 테스트도 통과하지만, 실제로 암호화하는 클라이언트는 하나도 없고,
기능 플래그는 off로 고정돼 있습니다. 카드 지시대로 구현하지 않고
CEO 결정을 기다립니다.

## 1. 서버: 키 디렉터리 + 종류 배관 (동작함, 사용자 없음)

- 키 저장소: D1 `e2ee_keys` 테이블
  (`scripts/cf_worker.js:352`, `prekey_sig` 마이그레이션 `:459`).
- 등록: `PUT /api/v1/devices/:id/keys` — identity_key 필수, signed
  prekey + 최대 100개 one-time prekey를 메모리 Map과 D1에 이중 기록
  (`:5639-5661`).
- 조회: `GET /api/v1/users/:id/keys` — 최신 번들 1건 반환, one-time
  prekey는 읽을 때마다 소진(`shift`)하고 D1에 반영 (`:5664-5691`).
- 메시지 종류: `ciphertext`가 허용 종류에 포함돼 있고(`:2991`),
  전송 시 메타데이터·본문을 그대로 통과시킬 뿐 암호문 검증은 없음
  (`:4238`). `ciphertext`를 보내는 주체는 코드베이스에 없음.
- 탈퇴 시 키 삭제: 메모리 `:1314-1316`, D1 `:1353`.
- 플래그: `e2ee_letter_sealing` = `enabled: false`,
  설명에 "not implemented" 명시 (`:2120`).
- 테스트: `scripts/e2ee_keys.test.mjs`(등록·소진·재배포 유지),
  `scripts/cf_worker.test.mjs:287-295`(플래그 off 고정),
  `scripts/cf_phases.test.mjs:66-75`,
  `scripts/auth_hardening.test.mjs:216`(등록 200) — 전부 디렉터리
  동작 검증이며, 실제 암호화 왕복 테스트는 없음.

## 2. 웹: 암호 원시 함수만 있고 호출처가 없음

- `apps/user-web/src/messenger-utils.ts:51-75`에 ECDH(P-256) 키 생성,
  공유 비밀 도출, AES-GCM 암호/복호 함수가 export돼 있고,
  `:186-203`에 double-ratchet 암복호 함수(비공개)가 있음.
- 그러나 호출처가 없음: `messenger-utils`에서 import되는 것은
  `queueOfflineMessage`(`MessengerView.vue:57-59`),
  `flushOfflineQueue`(`useChatSocket.ts:8`),
  WebRTC 3종(`useWebRTC.ts:10`)뿐. 키 등록·조회·암호 전송을
  호출하는 코드는 웹 전체에 없음.
- 설정 화면 "2단계 E2EE 키 관리" 행은 `e2ee_preparing`(준비 중)
  표시만 함 (`SettingsModal.vue:341-345`, 문구
  `luno-i18n.ts:437/1132/1827/2522`).
- `MessagePane.vue:206-208`의 `e2ee-tag` 클래스는 이름과 달리
  실시간 연결 상태(`connection_*`)를 보여주는 라벨이며 E2EE
  표시가 아님 (스타일 `App.vue:1481`).
- 참고: `mvEcoDriveStatus`의 "E2EE 암호화 적용" 문구는 Open Scanner
  생태계 소개 목록(`MessengerView.vue:2630-2639`)의 컨셉 문구로,
  메신저 암호화 주장과 무관함.

## 3. 앱: 정직한 "준비 중" + 암호 코드 없음

- `mobile/flutter_app/lib/pages/privacy.dart:67-74`와
  `settings.dart:176-181`에 "종단간 암호화 (E2EE) / 준비 중 —
  현재 전송 구간 암호화(TLS)만 적용됩니다"를 그대로 노출.
- 앱 코드베이스에 encrypt/decrypt/prekey/identity_key 관련
  구현·호출이 없음 (위 두 표시 행이 전부).
- 기기 목록(`loadDevices`, privacy.dart:25)은 세션 관리용이며
  E2EE 키와 무관.

## 4. 기기 추가·키 분실 시나리오

- 기기 추가: 새 기기가 `PUT devices/:id/keys`로 번들을 올리면
  `(user_id, device_id)` upsert로 공존 가능하고(`:5658`),
  조회는 최신 1건만 반환(`:5669`). 그러나 등록 주체가 없어
  실제로는 동작하지 않는 경로.
- 키 분실: 클라이언트에 키가 없으므로 잃을 것도 없고, 복구
  절차·경고 문구도 없음. 서버 D1에 테스트 외 번들이 쌓일
  일도 없음.
- 전송 중 암호화 상태: 모든 메시지(텍스트·첨부 메타 포함)가
  평문으로 서버에 저장되고, 전송 구간은 TLS만 적용됩니다. 서버·DB 접근
  권한자는 내용을 볼 수 있음.

## 5. 켜는 데 필요한 작업 (결정용, 미착수)

1. 프로토콜 확정: 1:1 Signal식 세션 vs 그룹 Sender Keys, 히스토리
   처리(신규 기기 과거 열람 범위) — 제품 결정 필요.
2. 웹: 키 생성·등록·조회·세션 래칫·ciphertext 송수신 연결
   (원시 함수는 있으나 배선 없음).
3. 앱: 암호 스택 신규 구현 (현재 코드 없음).
4. 서버: 플래그 on 조건, kind별 암호화 강제 여부, 키 검증·
   감사(audit) 정책.
5. 기기 추가·분실·탈퇴 시나리오의 UX와 복구 절차 정의.

## 6. CEO 결정 대기 항목

- E2EE를 이번 릴리스 범위에 포함하는지 (포함 시 1~5번 별도
  카드화 필요).
- 포함하지 않으면: 현 상태(서버 디렉터리 유지 + 양 클라이언트
  "준비 중" 표시)를 그대로 두고 F12로 진행해도 되는지.
- 생태계 소개 문구(`mvEcoDriveStatus` 등)의 "E2EE" 표현을
  유지·수정·삭제할지.
