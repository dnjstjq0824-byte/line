# LUNO PC agent — 폰에서 집 PC의 Muse에게 일 시키기

밖에서 LUNO 앱의 **PC 작업실** 방에 `/dev …` 같은 명령을 보내면, 집 PC에서 도는 이 러너가
Muse Code CLI(`muse exec`, 구독 로그인 · API 키 없음)로 작업하고 결과를 같은 방에 보고한다.

```
폰 LUNO 앱 ──▶ LUNO 서버(봇 작업 큐) ◀── 러너가 5~20초마다 가져감 (집 PC → 서버, 바깥 방향 HTTPS만)
                                              └ git worktree 에서 muse exec → 커밋 · 테스트 · 보고 · 병합 제안
폰에서 [승인] ──▶ 서버 ──▶ 러너가 main 에 fast-forward 병합
```

집 PC에는 열린 포트가 없다. 터널도 필요 없다.

## 명령

| 명령 | 하는 일 |
|---|---|
| `/status` | 실행 중 작업, 대기열, Muse 사용량 |
| `/git` | git status, 브랜치, 최근 커밋 |
| `/check` | 설정된 점검 명령 실행(테스트, `flutter analyze`) |
| `/continue [지시]` | 작업지시서의 다음 카드를 이어서 진행 (`continuePrompt`) |
| `/dev <지시>` | 개발 작업: 새 브랜치 → Muse → 커밋 → 테스트 → 보고 → 병합 제안 |
| `/mkt <지시>` | 마케팅 작업 (허용 경로만 수정 가능) |
| `/ask <질문>` | 코드를 읽고 답만 (쓰기·셸 꺼짐) |
| `/retry <번호> <지시>` | 같은 브랜치에서 이어서. 보고에 **답장**해도 같다 |
| `/merge <번호>` | 승인했지만 보류된 병합 다시 시도 |
| `/stop`, `/cancel <번호>` | 실행 중단, 대기 작업 취소 |
| `/log <번호>`, `/diff <번호>`, `/usage`, `/help` | 로그, diff, Muse 사용량, 도움말 |

앱의 PC 작업실 방에는 입력창 위에 러너 상태(준비됨 / 작업 중 / 오프라인)와
한 번 누르면 보내지는 명령 칩 4개(`/status`, `/git`, `/check`, `/continue`)가 나온다.

## 안전장치

- 서버: 마스터 스위치(`LLM_ENABLED`) + 허용목록(방 1개, 사용자 1명) + 킬스위치 + 방 범위 봇 토큰(30일).
- 러너: 방·작성자를 다시 확인하고, 30분 넘게 지난 명령은 실행하지 않는다.
- Muse는 항상 샌드박스를 켠 채 실행한다. `--yolo`, `--disable-sandbox`, `--disable-approval` 은 러너가 거부한다.
- 지시문은 파일(`--prompt-file`)로만 넘긴다. 명령줄에 채팅 문장이 들어가지 않는다.
- 작업은 `C:\luno-wt\<번호>` worktree 의 `luno-auto/…` 브랜치에서만 한다. main 은 폰에서 **[승인]** 을 눌러야,
  그리고 main 작업폴더가 깨끗할 때만 fast-forward 로 바뀐다.
- 금지 경로(`wrangler.jsonc`, `.github/**`, `*.jks`, `key.properties`, `.env*`, `scripts/migrations/**`)가 바뀌었거나
  diff에 비밀값 패턴이 있으면 실패 처리하고 병합을 제안하지 않는다. 보고 내용은 비밀값을 가린 뒤 보낸다.
- 푸시와 배포는 하지 않는다(`allowPush`, `allowDeploy` 기본 false, 이 버전에는 실행 코드도 없다).
- 비상 정지: 폰에서 `/stop` → 관리자 킬스위치(`PUT admin/llm/kill`) → 집 PC에서 `%USERPROFILE%\.luno-agent\STOP` 파일 생성.

## 설치 (집 PC, 한 번)

```powershell
# 1. 로그인 계정 만들기 (서버가 약관 동의를 요구하면 생년월일을 함께 준다)
node tools\pc-agent\setup\provision.mjs register --birthdate 1990-01-01

# 2. 그 계정을 관리자로 지정 (출력된 id를 넣는다) — Cloudflare 비밀값이라 저장소에 남지 않는다
npx wrangler secret put ADMIN_USER_IDS

# 3. 봇 발급 · PC 작업실 생성 · 허용목록 · 토큰 · 설정 파일
node tools\pc-agent\setup\provision.mjs setup

# 4. 절전 해제 + 5분 감시 작업 + 로그인 시 자동 시작, 그리고 지금 바로 실행
powershell -ExecutionPolicy Bypass -File tools\pc-agent\windows\install.ps1
```

`windows\go-live.ps1` 이 1~4를 한 번에 한다.

상태·비밀값은 저장소 밖 `%USERPROFILE%\.luno-agent\` 에 있다.

| 파일 | 내용 |
|---|---|
| `config.json` | 서버 주소, 내 사용자 id, 프로젝트(저장소 경로, 방, 테스트 명령, 금지 경로) |
| `secrets.json` | 봇 토큰 (본인 계정만 읽기) |
| `owner-login.json` | provision 이 만든 로그인 계정 (토큰 갱신용) |
| `tasks\*.json`, `TASK_QUEUE.md` | 작업 상태 (재부팅 후에도 이어짐) |
| `logs\agent.log`, `logs\<번호>.log`, `logs\<번호>.jsonl` | 러너 로그, 작업 로그, Muse 이벤트 원본 |
| `heartbeat`, `agent.lock`, `STOP` | 생존 신호, 단일 실행 잠금, 비상 정지 |

## 평소 쓰는 계정에서 봇을 친구로 추가해 쓰기

`provision.mjs`가 만든 계정 말고, 평소 쓰는 내 계정에서도 지시할 수 있다.

```powershell
node tools\pc-agent\setup\provision.mjs add-owner --email <내 계정 이메일>
powershell -ExecutionPolicy Bypass -File tools\pc-agent\windows\restart-agent.ps1
```

그다음 앱이나 웹에서 **ID로 친구 추가 → `luno_pc`** → 1:1 채팅을 열고 `/status` 같은 명령을 보낸다.
이 명령은 그 계정을 허용목록에 넣고, 그 계정과 봇의 1:1 방을 미리 허용하고, 봇 토큰을 두 방 범위로 다시 발급한다(이전 토큰은 폐기).
1:1 방에서는 내가 바로 [승인]할 수 있다. 다른 사람이 봇을 친구로 추가해도 허용목록에 없으면 아무 일도 일어나지 않는다.

## 운영

- 봇 토큰은 30일 뒤 만료된다: `node tools\pc-agent\setup\provision.mjs rotate` 후 러너 재시작.
- 러너 재시작: `powershell -File tools\pc-agent\windows\watchdog.ps1` (죽어 있으면 띄운다).
- 제거: `powershell -File tools\pc-agent\windows\uninstall.ps1`.
- 재부팅 뒤에는 Windows에 로그인해야 러너가 다시 뜬다. 완전 무인 복구가 필요하면 Windows 자동 로그인을 켠다.
- 프로젝트 추가: `config.json` 의 `projects[]` 에 항목을 더하고(다른 저장소, 다른 봇 토큰, 다른 방) 러너를 재시작한다.

## 테스트

```
cd tools\pc-agent
node --test "test/*.test.mjs"
```

가짜 Muse(`test/fake-muse.mjs`)와 임시 git 저장소로 접수 → 실행 → 커밋 → 테스트 → 보고 → 승인 → 병합,
그리고 거절·보류·금지 경로·시간 초과·중단·재시작 복구를 검증한다.
서버 쪽 라우팅은 `scripts/pc_agent_routing.test.mjs`.

## Muse CLI 실측 (1.4.20)

- `muse exec --json` 은 한 줄에 이벤트 하나를 낸다. 러너가 쓰는 것: `task.lifecycle.started`(단계 수),
  `run.output.delta`(본문 조각), `run.terminal.completed|failed`(마지막 답 `text`, `reason`). 모르는 이벤트는 무시한다.
- `muse usage` 출력의 `Weekly: N% used` 가 90% 이상이면 `/dev`·`/mkt`·`/continue` 를 보류한다(`/ask` 는 계속).
