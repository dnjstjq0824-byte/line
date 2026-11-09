# Docker 환경 검토

**검토일**: 2026-11-09
**방식**: 파일 정적 검토 only (셸 불가로 `docker build`/`compose up` 미검증)
**대상**: `docker-compose.yml`, `docker-compose.full.yml`, `backend/Dockerfile`, `.env.example`,
`k8s/`, `Makefile`, `docs/PRODUCTION_ENV_GUIDE.md`, `scripts/verify_deployment.sh`

## 1. 파일 인벤토리

| 파일 | 용도 |
|---|---|
| `docker-compose.yml` | 로컬 dev: postgres + api + redis + nats |
| `docker-compose.full.yml` | 상용 경로: postgres + redis + backend + coturn |
| `backend/Dockerfile` | Go 멀티스테이지 → distroless static nonroot |
| `k8s/` | Deployment/Service/HPA/Ingress 등 (CI 없음) |

## 2. 발견 사항

### High

1. **Dockerfile Go 버전이 go.mod보다 낮음**
   - `backend/Dockerfile`: `golang:1.23-bookworm` / `backend/go.mod`: `go 1.26.0`.
   - 1.23 툴체인이 1.26 모듈을 만나면 툴체인 자동 다운로드 시도. 네트워크 제한 환경에서
     빌드 실패 가능. 베이스를 `golang:1.26-bookworm`으로 올릴 것.

2. **full.yml의 coturn 설정이 무효**
   - `TURN_USERNAME`/`TURN_PASSWORD` 환경변수만 설정. 공식 `coturn/coturn` 이미지는
     realm·secret·계정을 환경변수로 받지 않음 (외부 문서 확인).
   - `turnserver.conf` 마운트 + `-c` 지정이 필요. 현 상태에서는 TURN 인증 없이 기동됨.

### Medium

3. **full.yml(상용 경로)이 `sslmode=disable`**
   - `PRODUCTION_ENV_GUIDE`는 상용 `sslmode=require` 명시. compose와 가이드 불일치.

4. **`MESSAGE_ENCRYPTION_KEY` 미설정 시 JWT_SECRET 재사용**
   - `backend/internal/server/core.go`: 빈값이면 `cfg.Secret`으로 대체.
   - full.yml 기본값이 빈값이라 상용에서 키 분리 없이 동작. 별도 키 필수화 권장.

5. **dev compose의 `nats`는 미사용**
   - 백엔드·스크립트 어디에서도 NATS/4222 접속 없음. 삭제 또는 용도 결정 필요.

6. **k8s `replicas: 3` + HPA vs 인메모리 실시간 허브**
   - Go 실시간 허브·레이트리밋은 인메모리(분산 미지원). 3 복제본 시 WS 팬아웃 깨짐.
   - 스케일아웃 전 Redis 기반 분산 전환이 선행 조건 (`PRODUCTION_ENV_GUIDE` §9와 일치).

### Low

7. **`.dockerignore` 없음 + `go.sum` 레이어 캐싱 누락**
   - Dockerfile이 `go.mod`만 먼저 복사. `go.sum`도 함께 복사 권장.

8. **`version: '3.8'` 잔재** — full.yml만 구키 보유. compose v2에서 무시됨. 삭제 권장.

9. **`verify_deployment.sh`가 v1 `docker-compose` 검사** — Makefile/README는 v2
   `docker compose` 사용. 검사와 실제 명령 불일치.

### Gap (누락)

10. **`agent/` 사이드카 컨테이너 정의 없음** — 상주 위치(a안 집PC vs 클라우드) 확정 후
    Dockerfile/compose 항목 추가 필요.
11. **k8s 이미지 빌드 파이프라인 없음** — `messenger-backend:latest`를 빌드·푸시하는
    CI가 없음 (`.github/` 없음). k8s 경로는 현 상태로 배포 불가.
12. **dev compose에 user-web 없음** — 프론트는 호스트 `npm run dev` 전제. 현 구조 유지 시
    문서 명시로 충분.

### 정상 확인

- dev/full 모두 `JWT_SECRET` 미설정 시 기동 실패 (fail-closed).
- full.yml postgres/redis healthcheck + backend `depends_on` 정상.
- k8s liveness/readiness `/healthz`·`/readyz`는 백엔드에 실제 존재.
- DB init 스크립트 마운트 + README 수동 재이관 경고 문서화됨.

## 3. 권장 순서

1. Dockerfile 베이스 `1.26` + `go.sum` 복사 + `.dockerignore` 추가.
2. coturn `turnserver.conf` 마운트 방식으로 교체.
3. full.yml `sslmode=require`, `MESSAGE_ENCRYPTION_KEY` 필수화.
4. nats 제거 여부 결정, `version` 키·verify 스크립트 정리.
5. agent 상주 위치 확정 후 컨테이너 정의, k8s 이미지 파이프라인은 별도 결정.

## 4. 한계

- 셸 장애로 빌드·기동 검증을 전혀 수행하지 못함. 위 내용은 코드·문서 대조 결과이며,
  수정 후 `docker build` + `compose up` 실검증이 필요.
