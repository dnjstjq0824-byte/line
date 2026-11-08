# Production Environment Configuration for LUNO Messenger

## Required Environment Variables

### Backend (Go API Server)

```bash
# Database
DATABASE_URL=postgres://messenger:PASSWORD@postgres:5432/messenger?sslmode=require

# Authentication
JWT_SECRET=<32+ byte random string>
MESSAGE_ENCRYPTION_KEY=<32 byte key for AES-256-GCM at-rest encryption>

# Server
PORT=8080
SERVICE_NAME=gateway
ALLOWED_ORIGINS=https://your-domain.com

# Push Notifications - FCM
FCM_PROJECT_ID=your-firebase-project-id
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}

# Push Notifications - APNs
APNS_KEY_ID=ABC123DEFG
APNS_TEAM_ID=TEAM123456
APNS_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"
APNS_BUNDLE_ID=com.yourcompany.messenger
APNS_PRODUCTION=true

# Push Token Encryption
PUSH_TOKEN_ENCRYPTION_KEY=<32 byte key>

# Redis (for distributed rate limiting)
REDIS_URL=redis://redis:6379
```

### Frontend (Vue Web App)

```bash
# API
VITE_API_URL=https://api.your-domain.com

# WebRTC
VITE_STUN_SERVERS=stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302
VITE_TURN_SERVER=turn:turn.your-domain.com:3478
VITE_TURN_USERNAME=turnuser
VITE_TURN_PASSWORD=turnpass
```

### Infrastructure

```bash
# PostgreSQL
POSTGRES_DB=messenger
POSTGRES_USER=messenger
POSTGRES_PASSWORD=<strong password>

# Redis
REDIS_PASSWORD=<strong password>

# TURN Server
TURN_USERNAME=turnuser
TURN_PASSWORD=<strong password>
TURN_REALM=your-domain.com
```

## Setup Instructions

### 1. FCM Setup
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate New Private Key"
3. Save the JSON file
4. Set `FCM_SERVICE_ACCOUNT_JSON` to the entire JSON content
5. Set `FCM_PROJECT_ID` to your Firebase project ID

### 2. APNs Setup
1. Go to Apple Developer Portal → Certificates, Identifiers & Profiles
2. Create an APNs Authentication Key (.p8 file)
3. Note the Key ID and Team ID
4. Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contents of .p8 file)
5. Set `APNS_BUNDLE_ID` to your app's bundle identifier
6. Set `APNS_PRODUCTION=true` for production

### 3. Message Encryption Key
Generate a 32-byte key:
```bash
openssl rand -base64 32
```

### 4. JWT Secret
Generate a 32+ byte secret:
```bash
openssl rand -base64 48
```

### 5. Push Token Encryption Key
Generate a 32-byte key:
```bash
openssl rand -base64 32
```

## Docker Compose Production

Use `docker-compose.full.yml` for production deployment:

```bash
# Create .env file with all variables above
cp .env.example .env
# Edit .env with your values
docker-compose -f docker-compose.full.yml up -d
```

## Kubernetes Deployment

Use the manifests in `k8s/` directory:

```bash
# Create secrets
kubectl apply -f k8s/secrets-template.yaml
# Edit secrets with actual values
kubectl apply -f k8s/postgres-statefulset.yaml
kubectl apply -f k8s/backend-deployment.yaml
```

## Health Check

Verify deployment:
```bash
curl https://api.your-domain.com/healthz
# Expected: {"status":"ok","service":"gateway"}
```

---

# 상용화 추가 설정 (2026-11-06 작업분)

위 원본 가이드는 유지되며, 아래는 코드 검증 결과와 이번 작업의 변경 사항이다.

## 6. 새로 추가된 변수

| 변수 | 필수 | 설명 |
| --- | --- | --- |
| `ALLOW_WALLET_TOPUP_SIM` | 개발 전용 | `true`일 때만 `POST /api/v1/wallet/charge` 시뮬레이터 동작. **상용에서는 절대 설정하지 말 것.** 미설정 시 Go·Worker 모두 503 `payments unavailable: verified provider integration required` |
| `GIT_COMMIT` / `BUILD_TIME` | 선택 | `GET /api/v1/version` 응답에 포함. 미설정 시 `unknown`/빈값 |
| `JWT_SECRET` | 필수 | compose가 미설정 시 기동 실패하도록 변경됨 (fail-closed, 기본값 삭제) |

## 7. 코드 실측과 문서의 차이

- `REDIS_URL`: compose·문서에는 있으나 Go 코드는 미사용 (레이트리밋은 인메모리). 분산 리밋 구현 시 배선 필요.
- `VITE_API_URL`만 실제 사용. `VITE_STUN_SERVERS`·`VITE_TURN_*`는 미사용 (클라이언트는 `stun.l.google.com` 하드코딩).
- Cloudflare 배포는 `wrangler.jsonc` 사용: `ALLOW_LOCAL_DEMO` + `STANDALONE_HOSTS`로 워커 내장 API 범위 제한.
  `API_BACKEND_ORIGIN`을 설정하면 `/api/*` 전체가 Go 백엔드로 프록시된다 (내구성 있는 상용 운영 권장).
- `ALLOW_LOCAL_DEMO=true`인 공개 호스트에서는 `/api/v1/auth/demo`가 비밀번호 없이 시드 계정 세션을
  발급한다. Go 프록시 전환 후에는 `false`로 내릴 것.

## 8. 검증 증거 (2026-11-06, Windows 로컬)

- `cd backend && go vet ./...` → 통과.
- `cd backend && go test ./...` → 전 패키지 통과 (신규 `TestWalletChargeFailClosedWithoutSimulatorFlag`,
  `TestVersionEndpointReportsServiceBuild`, `TestNewsSampleFeed` 포함). `-race`는 Windows에 gcc가 없어
  CI(Ubuntu)에서 수행.
- `node --test 'scripts/*.test.mjs'` → 69/69 통과 (신규 `cf_wallet_failclosed` 포함).
- `npm run build:apps` → 6개 워크스페이스 전부 `vue-tsc --noEmit` + `vite build` 통과.
- `node scripts/build_cf.js` → `dist_cf` + 스탬프 워커 생성 통과.
- 브라우저 실측(Edge headless + Go sqlite + 빌드 dist, 12개 체크): 회원가입/로그인, 충전 버튼 4개
  비활성화 + 안내 문구, 약관/방침 페이지, 비밀번호 12자 검증(네이티브+앱 메시지), 모바일 지갑 탭,
  콘솔 에러 0건 → 전부 통과. 스크린샷은 검증 기록에 보관.

## 9. 남은 작업 (자격 증명·인프라 필요)

1. PG 연동(Toss/Stripe) + 결제 웹훅 구현 후 `wallet/charge`·`store/orders`의 503 게이트 해제.
2. E2EE 프로토콜 (키 테이블·클라이언트 키 유틸은 존재, 실제 암호화 송수신 미배선).
3. Redis 기반 분산 레이트리밋, 분산 리얼타임 (Go 인메모리 허브·워커 격리-로컬 상태).
4. 소셜 로그인/OIDC, MFA/패스키, SMS 발송사 연동.
5. Sentry/구조화 로깅/트레이싱, 프론트 E2E(Playwright 등) 정식 스위트화.
6. 미사용 Vue 컴포넌트 6종 정리, `github.com/example/...` 모듈 경로 변경, 온보딩 플로우,
   httpOnly 쿠키 세션 전환, Argon2id 전환.
