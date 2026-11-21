# 실서버 한번 반영 작업지시서 (2026-11-21)

build 19 이후 쌓인 변경(서버·웹·앱 build 20)을 한 번에 반영한다.
실행은 대표(의장님)가 직접 한다. 비밀값은 이 문서에 적지 않는다.

## 0. 현재 상태와 이번 범위

- 실서버(2026-11-21 확인): worker sha256 `c06b3dbb…`, 앱 build 19, lunotalk.com·workers.dev 모두 정상.
- 이번에 반영할 main 커밋: `c608824`(6-2) · `b1f088c`(6-3·6-4) · `35182f0`(6-6·6-8) · `f191f6d`(증거물) + 앱 점검 후속(반영 전 커밋 필요, 아래 1-0).
- 포함된 동작 변경 3건(배포 전 아래 1-1에서 확정):
  1. 서버·앱 기본 주소가 lunotalk.com(구 workers.dev 주소는 계속 동작).
  2. 업무 콘솔이 isolate 메모리에서 D1으로 이동(`DURABLE_BUSINESS=true`).
  3. PC 꺼짐 감지 cron(2분)이 함께 배포됨.

## 1. 배포 전 확정·준비

- [ ] 1-0. 앱 점검 후속 변경을 커밋·푸시한다(허위 문구 삭제, 아바타 통일, 뒤로가기 중복 제거 등).
- [ ] 1-1. 위 동작 변경 3건을 승인한다. cron을 빼려면 배포 전에 `wrangler.jsonc`·`wrangler.nobuild.jsonc`의 `triggers`를 지우고 아래 검사를 다시 돌린다.
- [ ] 1-2. 계정 확인: `npx wrangler whoami` → Account ID가 `6d53e0a8`로 시작하는지.
- [ ] 1-3. 최종 검사(통과 기준): `node --test "scripts/*.test.mjs"` 671/671 · `node scripts/pre_deploy_gate.mjs` GREEN · `cd mobile/flutter_app && flutter test` 425/425 · `npx vue-tsc --noEmit`(user-web) 깨끗함.

## 2. D1·시크릿 (마이그레이션 없음)

- 원격 D1 수동 마이그레이션: **없음**. `luno_chat_meta`는 런타임 스키마라 첫 요청 때 자동 생성된다.
- 시크릿 추가·변경: **없음**. 이미 등록된 `ADMIN_USER_IDS`, `FCM_SERVICE_ACCOUNT_JSON`, `GOOGLE_AI_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, `TURN_SECRET` 그대로.
- 새 vars(`DURABLE_BUSINESS=true`)는 설정 파일과 함께 배포된다.

## 3. 순서: 서버·웹 먼저, 앱은 그 다음

### 3-1. 서버·웹 (main에서, 약 10분)

1. `node --test "scripts/*.test.mjs"` 통과 확인.
2. `node scripts/build_cf.js` 전체 실행(6개 앱 빌드 + `dist_cf/` 복사 + 버전·서비스워커·보안헤더·`dist_worker` 스탬프까지 한 번에). `Public base stamped (https://lunotalk.com …)`와 `Combined Cloudflare distribution prepared` 확인.
3. `npx wrangler deploy -c wrangler.nobuild.jsonc`.
4. 확인: `node docs/handover_20261120/tools/verify.mjs` → 500 0건, `/api/v1/version`의 `worker_source_sha256` = main `scripts/cf_worker.js`의 sha256.

### 3-2. 앱 build 20 (약 30분)

1. main에서 `flutter test` 전체 통과 확인(부분만 돌리지 말 것).
2. `line-app13`에서 `release/build20` 브랜치 → 변경 파일 복사 → `pubspec.yaml` `2.0.0+20` → 커밋.
3. `flutter test` 전체 → `flutter build apk --release --split-per-abi`.
4. 서명 확인: `apksigner verify --print-certs` 인증서 SHA-256 = `f2d72ccc…4c977c`, `aapt2 dump badging` versionCode `2020`.
5. `gh release create v2.0.0-build20 -R dnjstjq0824-byte/line --target <전체 sha>` + APK 3개.
6. 다운로드 교체: `tools/bump19.cjs`를 복사해 build 20용 값(크기·sha)으로 바꿔 main에 실행 → 3-1의 3~6 반복(웹 있게 한 번 더 배포).

### 3-3. 반영 후 확인

- `verify.mjs` GREEN, `/download`가 build 20 arm64를 내려주는지(크기·sha 대조).
- 폰 실기: lunotalk.com 로그인 → 대화방 고정·음소거·숨김 → 다른 기기(웹)에서 같은 표시 확인 → 음성·영상 통화 1회.
- 구버전 앱(workers.dev 직결) 로그인이 여전히 되는지 1회.

## 4. 롤백

- 서버·웹: `npx wrangler rollback -c wrangler.nobuild.jsonc`(직전 버전으로) 후 3-3의 verify만 다시 실행. D1 되돌리기 불필요(추가된 테이블·컬럼은 구 코드가 무시함).
- 앱: 다운로드 교체를 되돌리는 커밋(build 19 값으로) 후 3-1의 3~6. 이미 설치된 build 20은 그대로 둬도 됨(서버 호환 유지).

## 5. 이번에 안 하는 것

- F11 E2EE(별도 대표 결정 필요), 6-5 중계 재배포(대표 별도 명령), 6-7 본 계정 이전(11-30 이후), 봇 토큰 갱신(12-15 전 별도 실행).
