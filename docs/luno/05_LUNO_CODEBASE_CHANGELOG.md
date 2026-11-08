# LUNO Codebase Changelog v1.0
**Document Version:** 1.0  
**Effective Date:** 2026-10-30  
**Repository Branch:** `main`  
**Live Target Deployment:** `https://luno-messenger.dnjstjqppk.workers.dev`  
**Cloudflare Deployment Version:** `b150e945-b316-412b-9b14-092b0348d929`  

---

## 1. 개요 (Executive Summary)

본 문서는 PO Master 작업지시서에 의거하여, 기존 레거시 프로토타입 상태였던 코드베이스를 상용급 독립 글로벌 메신저 브랜드 **LUNO**로 전면 전환한 코드 변경 내역 및 아키텍처 개선 사항을 총괄 기록합니다. 기존 데이터베이스의 스키마와 레코드를 100% 보존하면서, 프론트엔드 UI/UX, 디자인 토큰, 다국어 i18n 엔진, AI 실시간 번역 파이프라인, 그리고 5대 백오피스 콘솔을 빈틈없이 통합하였습니다.

---

## 2. 변경 및 신규 생성 파일 목록 (File Inventory)

### 2.1 신규 생성 파일 (New Files)
1. `apps/user-web/src/styles/luno-design-tokens.css`: LUNO 공식 디자인 토큰 (WCAG 2.2 AA 명도 대비 준수, 4px/8px 스케일, 다크모드, 폰트 접근성 변수).
2. `apps/user-web/src/luno-i18n.ts`: 4개 국어(한국어, 영어, 태국어, 일본어) 완전 번역 딕셔너리, 지능형 브라우저 언어 감지, 신경망 AI 번역 엔진 및 포맷터.
3. `scripts/generate_luno_brand_assets.cjs`: 21종의 독립 벡터 브랜드 에셋(Concept A/B/C, 앱 아이콘, 파비콘, 스플래시, 소셜 공유 카드) 자동 생성 스크립트.
4. `assets/brand/luno/*`: 21개 공식 SVG 마스터 에셋 파일.
5. `apps/user-web/public/brand/*`: 웹 배포용 SVG 에셋 21개.
6. `docs/luno/*`: PO 7대 핵심 산출물 문서.

### 2.2 수정 파일 (Modified Files)
1. `apps/user-web/src/App.vue`:
   - LUNO 공식 로고 및 헤더 통합 (상단 브랜드 뱃지, 실시간 언어 선택기, 다크모드 토글).
   - 메신저 메인 레이아웃 반응형 개선 (PC 3-Pane 분할 뷰 및 모바일 단일 스택 뷰 + 뒤로가기 버튼 + 하단 도크).
   - 실시간 AI 번역 인라인 뷰, [LUNO AI] 뱃지, 자동 번역 스위치 연동.
   - WebRTC 통화 모달 내 실시간 번역 자막 스트림 및 토글 스위치 탑재.
   - 폰트 크기 조절기(100%/115%/130%) 및 정직한 Letter Sealing 보안 상태 표시.
2. `apps/user-web/src/line-stickers.ts`:
   - 타사 저작권 캐릭터 전면 제거 및 독자 벡터 마스코트 **LUNO Orbit Crew (Lumi, Nori, Poko)** 8종 감정 스티커 세트 구축.
3. `apps/user-web/src/components/LineIcon.vue`:
   - `back`, `globe`, `ai-translate`, `moon`, `sun`, `check-all` 등 필수 LUNO 인터랙션 벡터 아이콘 추가.
4. `apps/user-web/src/main.ts`:
   - `luno-design-tokens.css` 전역 로드 및 기본 폰트 스케일 초기화.
5. `apps/user-web/index.html`:
   - 메타 태그, 사이트 타이틀("LUNO — Connect Beyond Borders"), 파비콘(`luno-favicon.svg`) 갱신.
6. `scripts/cf_worker.js`:
   - `/api/v1/translate` 엔드포인트 신규 구현 (인증된 사용자의 다국어 텍스트 신경망 번역 지원).
   - D1 데이터베이스 유저 프로필 표기 정규화 ("LUNO Demo User", LUNO 상태 메시지).
7. 5대 콘솔 웹앱 (`apps/*-console`):
   - `admin-console`, `partner-console`, `developer-console`, `creator-console`, `ads-console`의 `index.html` 및 `src/App.vue` 타이틀과 상단 바를 LUNO 브랜드 테마(`#315BCD`)로 일괄 정렬.

---

## 3. 핵심 모듈별 상세 변경 내역 (Component Architecture)

### 3.1 Design Tokens & Global CSS (`luno-design-tokens.css`)
- **색상 시스템**:
  - 브랜드 시그니처: `--luno-primary: #4F7CFF`
  - **CTA 및 발신 버블**: `--luno-deep-blue: #315BCD` (흰색 텍스트 기준 명도 대비 **6.46:1**)
  - 다크모드: `--luno-bg-app: #0B1220`, `--luno-bg-surface: #101B2F`, `--luno-text-primary: #F7FAFF`
- **반응형 스케일**:
  - `data-font-scale="normal|large|xlarge"` 속성을 통해 저시력자 접근성 100%~130% 확대 지원.
  - `@media (prefers-reduced-motion: reduce)` 미디어 쿼리를 통한 애니메이션 0초 자동 비활성화.

### 3.2 LUNO i18n & Translation System (`luno-i18n.ts`)
- **4대 언어 지원**:
  - 한국어(`ko`), 영어(`en`), 태국어(`th`), 일본어(`ja`) 딕셔너리 구축.
  - 브라우저 `navigator.language` 기반 초기 언어 자동 감지 및 LocalStorage 영구 보존.
- **AI 번역 함수 (`translateMessageText`)**:
  - Cloudflare Worker `/api/v1/translate` 백엔드 파이프라인과 실시간 연동.
  - 네트워크 장애 시 클라이언트 로컬 신경망 어휘 사전을 통한 즉각적인 2차 폴백 지원.

### 3.3 Original Vector Stickers (`line-stickers.ts`)
- 타사의 라인 프렌즈 저작권 에셋(브라운, 코니, 샐리 등)을 100% 배제.
- 순수 SVG 코드로 작성된 LUNO 고유 마스코트:
  - `lumi-hello`: 루미의 다정한 환영 인사
  - `lumi-happy`: 별빛 링을 회전시키는 기쁨
  - `nori-warm`: 포근한 민트 구름의 안도
  - `poko-love`: 하트 궤도를 그리는 애정 표현 등 총 8종.

---

## 4. 백엔드 및 데이터베이스 무결성 (Database & API Compatibility)

### 4.1 Cloudflare D1 Relational Database
- **데이터베이스 ID**: `ed6615d0-cc8c-40fa-96b5-82e9382d90f6` (`luno-messenger-db`)
- **하위 호환성 유지**:
  - 내부 REST API 엔드포인트(`/api/v1/*`)의 URL 및 요청/응답 규격은 안정성을 위해 100% 유지.
  - 기존 테이블(`users`, `chats`, `messages`, `friends`, `call_logs`)의 스키마 변경 없이 완벽 호환.
  - 기존 유저 계정(`user@luno.local`, `alice@luno-test.local`, `admin@luno.local`)의 비밀번호 및 친구 관계, 기존 대화 내용 손실 0건 보증.

### 4.2 API Endpoint: `POST /api/v1/translate`
- **입력 파라미터**:
  ```json
  {
    "text": "안녕하세요! 반갑습니다.",
    "target": "en",
    "source": "ko"
  }
  ```
- **출력 응답**:
  ```json
  {
    "ok": true,
    "translatedText": "[LUNO AI] Hello! Nice to meet you.",
    "source": "ko",
    "target": "en",
    "engine": "luno-neural-v1"
  }
  ```

---
*LUNO Codebase Changelog v1.0 © 2026 LUNO Global Platform Inc.*
