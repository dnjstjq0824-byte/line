# Muse Studio 작업지시서 — 원격 작업 시스템 보강 (2026-11-17)

받는 사람: Muse Spark 1.3 (VS Code의 Muse Studio, 대표가 지켜보는 대화형 세션)

## 0. 먼저 알 것

- **작업 폴더는 `C:\luno-studio` 하나다.** 브랜치 `studio/remote-work-20261117`(main에서 갈라짐)가 이미 만들어져 있다.
  `C:\Users\dnjst\Desktop\project\line`(main)과 `C:\luno-wt\*`(러너 자동 진행)는 **읽지도 쓰지도 마라.**
  같은 시간에 러너가 `docs/MUSE_WORK_ORDER.md`의 메신저 카드(A1~A12)를 자동으로 진행 중이다. 그 카드는 네 일이 아니다.
- 이 지시서는 원격 작업 시스템(폰 LUNO → 집 PC 러너 → Muse) 보강이다. 정본 문서:
  - `LUNO_REMOTE_WORK_BLUEPRINT.md` 9장 (각 카드의 세부 요구사항)
  - `tools/pc-agent/README.md` (러너 구조·명령·안전장치)
  - `docs/HANDOVER_20261115.md` 7장 (깨면 안 되는 핀)
- 카드는 위에서부터 하나씩. 한 카드가 끝나면 **테스트 통과 → 커밋 → 이 파일의 체크박스를 `- [x]`로 바꾸고 한 줄 결과**를 적은 뒤 다음 카드로 간다.
- 커밋 메시지: 영어 소문자 명령형 한 줄 제목 + 본문에 무엇을 왜. 카드 하나에 커밋 하나 이상.

## 1. 하지 말 것

- `git push`, `npm run deploy`, `wrangler deploy`, 원격 D1(`--remote`), APK 빌드·릴리스, 비밀값 출력.
- `wrangler.jsonc`는 S1의 cron 한 줄(`"triggers": {"crons": ["*/2 * * * *"]}`)만 추가할 수 있다. `run_worker_first` 목록은 건드리지 마라(빠지면 모든 API가 405가 된다).
- 샌드박스를 끄는 옵션(`--disable-sandbox`, `--yolo`, `--disable-approval`)을 러너에 넣지 마라. 러너는 이 옵션을 거부하는 것이 맞다.
- `*.jks`, `key.properties`, `.env*`, `scripts/migrations/**`, `.github/**` 수정.
- 사람이 해야 하는 일(실서버 계정·봇 발급, 배포, 결제·푸시 키)은 하지 말고 결과 보고에 "대표 조치 필요"로 적는다.

## 2. 매 카드 끝에 돌릴 것

```
node --test "scripts/*.test.mjs"
cd tools/pc-agent && node --test "test/*.test.mjs"
```
웹·관리자 콘솔을 바꿨으면 해당 앱에서 `node ../../node_modules/vue-tsc/bin/vue-tsc.js --noEmit`,
앱을 바꿨으면 `cd mobile/flutter_app && flutter analyze && flutter test`.

이 PC에서는 Muse의 셸 도구가 샌드박스 시작 1초 제한(`WindowsRunnerSpawnReadyDeadlineExpired`)으로 실패할 수 있다.
그러면 S0부터 해결하고, 해결이 안 되면 실행이 필요한 명령을 대표에게 승인 요청해 실행한다. **테스트를 돌리지 않고 카드를 완료 처리하지 마라.**

## 3. 카드

- [x] **S0 Muse 셸 샌드박스 진단** — 러너의 무인 실행(`muse exec`)에서 셸 도구가 매번 `windows_elevated unified exec session failed: failed to read runner spawn_ready: WindowsRunnerSpawnReadyDeadlineExpired after 1000ms`로 실패하고 한 번은 `액세스가 거부되었습니다 (os error 5)`가 났다(`muse sandbox windows check`는 전부 ready). 로그: `%USERPROFILE%\.luno-agent\logs\T-0021.jsonl`, `T-0029.jsonl`. 원인을 찾아라(백신 실시간 검사, 첫 실행 지연, 사용자 프로필·권한, 동시 실행 등). **샌드박스를 끄지 않는** 해결책이 있으면 적용 방법을 `tools/pc-agent/README.md`의 "Muse CLI 실측" 절에 적고, 시스템 설정 변경이 필요하면 대표가 실행할 정확한 명령으로 적는다. 완료: README 갱신 + 재현/확인 방법. → 완료: 원인 확정(exec 경로 CreateProcessAsUserW 거부, 11-16 이후 전멸, 격리 유지 해결책 없음) + 재현법, README 기록.
- [ ] **S1 PC 꺼짐 감지 (설계서 9-2)** — 서버: claim 때 `luno_bot_config`에 `seen:<botId>`(60초에 한 번만 쓰기), Worker `scheduled()` 핸들러, 마지막 접속 3분 초과 시 작업방에 1회 경고, 복구 뒤 다시 꺼지면 다시 경고. `wrangler.jsonc`에 cron 한 줄. 러너: 복구 시 "🟢 복구됨, 대기 지시 n건" 1회. 완료: 설계서 9-2의 테스트 4가지를 `scripts/pc_agent_routing.test.mjs`(또는 새 파일)에 추가해 통과.
- [ ] **S2 되돌리기 `/revert T-0007` (9-7)** — 병합된 작업의 커밋을 되돌리는 커밋을 새 `luno-auto/` 브랜치에 만들고 테스트 → 보고 → 제안. main은 승인 때만 바뀐다. 실서버에 이미 배포된 변경이면 "운영에는 아직 남아 있음, 배포 필요" 안내. 완료: `tools/pc-agent/test/flow.test.mjs`에 병합 → /revert → 승인 → 파일 원복 테스트.
- [ ] **S3 아침 브리핑·승인 대기 재알림·조용한 시간 (9-9)** — 러너: 매일 설정 시각(기본 07:30)에 지난 24시간 완료·실패, 승인 대기 제안, 자동 진행 상태(`AUTOPILOT.json`), Muse 주간 사용량, 봇 토큰 만료일을 1개 메시지로. 제안이 6시간 넘게 대기하면 1회 재알림. 조용한 시간(기본 01:00~07:00)에는 진행 메시지 생략, 완료 보고만. 시계는 주입 가능하게(테스트용). 완료: 가짜 시계로 브리핑·재알림·조용한 시간 테스트.
- [ ] **S4 정기 작업 `/every` (9-9)** — `/every 07:00 /ask 어제 커밋 요약`, `/every list`, `/every off <번호>`, 최대 5개, 러너 상태 폴더에 저장. 코드 변경 명령(`/dev`, `/mkt`, `/auto`)은 정기 작업으로 등록 거부. 완료: 등록·목록·해제·거부·실행 테스트.
- [ ] **S5 긴급 지시 하루 5회 제한 (9-8)** — `/dev!`·`/mkt!`는 이미 대기열 맨 앞으로 간다. 하루 5회를 넘으면 일반 대기로 넣고 그렇게 알린다. 완료: 6번째가 일반 대기로 들어가는 테스트.
- [ ] **S6 보고 도착 임시 알림 ntfy (9-1, 기본 꺼짐)** — 러너 설정 `notify.ntfyTopic`이 있을 때만, 완료·실패·승인 대기·PC 꺼짐을 **내용 없는 한 줄**(`LUNO: T-0003 완료`)로 보낸다. 요약·코드·diff는 절대 넣지 않는다. 설정이 없으면 외부 호출 0건. 완료: 설정 없음 → 호출 0, 설정 있음 → 본문에 작업 번호와 상태만 있는지 테스트(가짜 fetch).
- [ ] **S7 화면 캡처 보고 (9-5)** — 서버: 봇 토큰으로 `POST attachments`(토큰 범위 안의 방, `post` 권한, 이미지만, 5MB 이하)와 범위 검사 테스트. 러너: 웹(`apps/user-web/**`)이 바뀐 작업이면 worktree에서 개발 서버를 띄우고 루트 `node_modules`의 Playwright로 390×844·1280×800을 캡처해 보고에 첨부(프로젝트 설정 `screenshots[]`, 기본 끔). 완료: 서버 범위 검사 테스트 + 러너는 가짜 캡처 함수로 첨부 흐름 테스트.
- [ ] **S8 관리자 콘솔 봇 관리 화면** — `apps/admin-console`에 봇 목록, 새 봇 발급, 토큰 갱신(만료일 표시), 킬스위치 켜기/끄기, 허용목록 보기. 서버의 기존 관리자 API(`admin/bots`, `admin/llm/*`)만 쓰고, 토큰 원문은 발급 직후 한 번만 보여 준다. 완료: 콘솔 vue-tsc·빌드 통과, 관리자 API 호출을 핀하는 테스트.
- [ ] **S9 프로젝트 추가 자동화** — `node tools/pc-agent/setup/provision.mjs add-project --id shop --name 쇼핑몰 --repo <경로>`: 봇 발급·작업방 생성·허용목록·토큰·`config.json`의 `projects[]` 추가를 한 번에. 실서버 쓰기는 대표가 실행하는 명령이므로, 로컬 테스트는 가짜 서버로. 완료: 가짜 서버로 add-project 전체 흐름 테스트 + README 사용법.

## 4. 끝났을 때

마지막에 이 파일 맨 아래에 "## 결과"를 추가해 카드별 커밋 해시, 테스트 결과, 대표 조치 필요 항목을 적고 커밋한다.

그다음 **네가 직접 main에 합친다** (대표 지시, 2026-11-17). 순서:
1. `git -C C:\Users\dnjst\Desktop\project\line status --porcelain` 이 비어 있는지 확인한다. 비어 있지 않으면 합치지 말고 결과에 적는다.
2. `C:\luno-studio`에서 `git rebase main` → 2장의 테스트를 전부 다시 돌려 통과시킨다(충돌은 양쪽 의도를 살려 해결).
3. `git -C C:\Users\dnjst\Desktop\project\line merge --ff-only studio/remote-work-20261117`
4. main 폴더에서 `node --test "scripts/*.test.mjs"` 와 `cd tools/pc-agent && node --test "test/*.test.mjs"` 를 한 번 더 돌려 확인한다.
러너가 같은 때 main 에 병합 중이면 3이 실패할 수 있다. 그때는 2부터 다시 한다.
푸시·배포는 여전히 하지 않는다(대표가 따로 지시).
