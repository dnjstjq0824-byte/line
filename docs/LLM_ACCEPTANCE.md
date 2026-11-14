# LLM 트랙 수락 시나리오 (L-15)

실제 LLM 연결 없이, 가짜 LLM으로 멘션부터 결정 기록까지 전체 흐름을
로컬에서 검증한다. 실제 LLM 호출은 0건이다 (결정 17).

## 시나리오

1. 관리자가 봇을 발급한다 (`POST /api/v1/admin/bots`).
2. 방에 봇을 초대하고 방·사용자를 허용 목록에 올린다
   (`POST /api/v1/admin/llm/allowlist`, `LLM_ENABLED=true`).
3. 방 범위 토큰을 발급한다 (`POST /api/v1/admin/bots/:id/tokens`).
4. 사용자가 `@봇` 멘션을 보내면 mention 작업 1건이 생긴다 (L-02).
5. 러너가 작업을 가져와서(`POST /api/v1/bot/jobs/claim`) 방 글을 읽고
   가짜 LLM 초안을 제안 메시지로 게시한 뒤 작업을 완료 보고한다.
6. 방장이 승인함에서 승인하면 결정 1건이 기록되고(L-04)
   결정 메시지가 방에 게시된다 (L-05).
7. 사용량(요청·토큰)과 감사로그(`bot.read`·`bot.propose`·`proposal.decide`)가 남는다.

## 실행

```sh
node --test scripts/llm_bots.test.mjs   # L-15 포함 전수 (L-01~L-11, L-15, L-17)
cd agent && go test ./...               # 어댑터 단위 테스트
```

실서버 러너 왕복 (fake 공급자, 로컬 하네스 필요):

```sh
npx wrangler dev --port 8791 --config wrangler.jsonc --var LLM_ENABLED:true
# 로컬 D1에 관리자 부여 후 로그인해서 토큰 확보
cd agent
LUNO_E2E_BASE=http://127.0.0.1:8791 LUNO_E2E_ADMIN_TOKEN=<관리자 토큰> \
  go test -run TestLiveFakeExchange ./... -count=1
```

## 증거

- `scripts/llm_bots.test.mjs` — L-15 테스트가 위 1~7단계를 실제 sqlite
  isolate에서 한 번에 통과. 워커 소스에 LLM 호스트 문자열이 없음을 고정.
- `agent/main_test.go` — `TestLiveFakeExchange`가 실제 러너 바이너리로
  멘션→답장을 로컬 서버와 주고받음 (fake 공급자, 스킵 가능).
- 실제 LLM 호출 0건: 워커는 LLM을 호출하는 코드가 없고,
  러너 기본 공급자는 echo이며 fake는 네트워크를 쓰지 않는다.

## 범위 밖 (보류)

- 실제 LLM 연결(muse code 등), API 키, 외부 호출 (결정 17).
- L-12 칸반 미러링, L-13 오케스트레이터, L-14 로컬 익스큐터, L-16 결정 기록.
- 러너는 텍스트 답장만 게시한다. 제안서 작성 주체는 가짜 LLM 대역이며,
  실제 모델의 제안 품질은 이 단계에서 다루지 않는다.
