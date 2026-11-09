# @muse 에이전트 봇 (준비 단계)

메신저 안에서 친구처럼 대화하는 LLM 사이드카. 표준 라이브러리만 사용.

## 동작

1. 봇 계정으로 로그인 (플랫폼 `bot`).
2. N초마다 대화 목록 → 각 방 `sync?after_sequence` 폴링.
3. 화이트리스트 사용자의 새 텍스트 메시지에만 답장. 커서는 본 것까지 항상 전진.
4. 답장 생성: `--echo`면 `echo: <원문>`, 아니면 OpenAI 호환 `/chat/completions`.

## 설정 (환경변수)

| 변수 | 필수 | 설명 |
|---|---|---|
| LUNO_BASE_URL | - | 기본 `http://localhost:8080` |
| LUNO_BOT_EMAIL / LUNO_BOT_PASSWORD | 예 | 봇 계정 |
| LUNO_WHITELIST | 권장 | 답장할 user_id CSV. 비어 있으면 아무에게도 답장 안 함 (fail-closed) |
| LLM_BASE_URL | - | 기본 OpenAI. 호환 서버면 교체 |
| LLM_API_KEY | 예 (echo 제외) | 미수령 상태 |
| LLM_MODEL | - | 기본 `gpt-4o-mini` |
| AGENT_POLL_SECONDS | - | 기본 5 |
| AGENT_CURSOR_FILE | - | 기본 `cursors.json` (0600) |

## 실행

```sh
cd agent
go build ./... && go test ./... -count=1
LUNO_BOT_EMAIL=bot@example.test LUNO_BOT_PASSWORD=... LUNO_WHITELIST=<id> go run . --echo --once
```

## 봇 시드 순서 (클라우드 구매 후)

1. `POST /api/v1/auth/register`로 봇 계정 생성 (display_name `muse`, handle `muse`).
2. 로그인해서 `user_id` 확보 → `LUNO_WHITELIST`에 친구들의 `user_id` 등록.
3. 친구들이 `@muse`를 친구추가 → 1:1 방에서 대화.
4. `LLM_API_KEY` 발급 후 `--echo` 없이 실행.

## 미결정

- 상주 위치: 기존 결정은 집PC 로컬(a안). 2026-11-09에 클라우드 서버 구매 필요 언급됨.
  이 스캐폴드는 어느 쪽이든 그대로 실행됨. 구매 전까지는 `--echo`로 폴링/답장 루프만 검증.
- 비용: 친구 10명 보통 사용 시 월 2~3만원 합의 (서버 1.4만 + 토큰 ~1만). 별도 과금 가드 없음.
