# LUNO 에이전트 러너 (LLM 트랙 준비 단계)

메신저 작업 큐(L-07)를 처리하는 봇 러너. 표준 라이브러리만 사용.

## 동작

1. 봇 범위 토큰(L-06)으로 인증. 비밀번호 로그인은 봇에게 막혀 있다.
2. `POST /api/v1/bot/jobs/claim`으로 작업을 하나씩 가져옴.
3. mention 작업: 멘션 메시지를 `sync?since_sequence`로 다시 읽어 확인.
4. 화이트리스트 작성자일 때만 LLM 공급자로 답장을 만들고 원문에 답장.
5. 작업을 `done`/`failed`로 완료 보고.

## 설정 (환경변수)

| 변수 | 필수 | 설명 |
|---|---|---|
| LUNO_BASE_URL | - | 기본 `http://localhost:8080` |
| LUNO_BOT_TOKEN | 예 | `POST /api/v1/admin/bots/:id/tokens` 발급값 |
| LUNO_WHITELIST | 권장 | 답장할 user_id CSV. 비어 있으면 멘션 작업을 건너뜀 (fail-closed) |
| LLM_PROVIDER | - | `echo`(기본) · `fake`(고정 답장+가짜 토큰 수) · `openai`(명시 선택+키 필요) |
| LLM_BASE_URL | - | openai용. 기본 OpenAI 호환 주소 |
| LLM_API_KEY | openai만 | 미수령 상태. 없으면 openai 선택 불가 |
| LLM_MODEL | - | openai용. 기본 `gpt-4o-mini` |
| AGENT_POLL_SECONDS | - | 기본 5 |

## 실행

```sh
cd agent
go build ./... && go test ./... -count=1
LUNO_BOT_TOKEN=cf-bot-... LUNO_WHITELIST=<id> go run . --once
LLM_PROVIDER=fake LUNO_BOT_TOKEN=cf-bot-... go run . --once
```

E2E(로컬 서버와 fake 주고받기):

```sh
LUNO_E2E_BASE=http://127.0.0.1:8791 LUNO_E2E_ADMIN_TOKEN=<관리자 토큰> go test -run TestLiveFakeExchange ./... -count=1
```

## 봇 준비 순서 (로컬)

1. 관리자 토큰 확보 (로컬 D1 `luno_user_roles`에 admin 행 추가 또는 `ADMIN_USER_IDS`).
2. `POST /api/v1/admin/bots`로 봇 발급, 방에 초대.
3. `POST /api/v1/admin/llm/allowlist`로 방·사용자 등록, `LLM_ENABLED=true`.
4. `POST /api/v1/admin/bots/:id/tokens`로 방 범위 토큰 발급 → `LUNO_BOT_TOKEN`.
5. 멘션 후 러너 실행. 실제 LLM 연결 없음 (결정 17).
