# LUNO UI/UX Screen Inventory v1.0
**Document Version:** 1.0  
**Effective Date:** 2026-10-30  
**Target Codebase:** `apps/user-web`, `apps/admin-console`, `apps/partner-console`, `apps/developer-console`, `apps/creator-console`, `apps/ads-console`  
**Classification:** Complete Cross-Platform Screen Audit  

---

## 1. 개요 및 스크린 전수 조사 방법론

본 인벤토리는 PO Master 작업지시서 제8조에 명시된 7대 핵심 영역(A~G)에 대해 실제 코드베이스 구현 상태, 컴포넌트 매핑, 디자인 토큰 적용 여부, 검증 상태를 전수 조사하여 기록한 규격서입니다.

---

## 2. 세부 화면별 전수 조사 매트릭스

### A. 초기 진입 영역 (Onboarding & Authentication)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-A01** | Splash Screen | `apps/user-web/public/brand/luno-splash.svg` | `VERIFIED` | 앱 기동 시 LUNO Chat Symbol과 슬로건 "Connect Beyond Borders" 페이드인 노출. |
| **SCR-A02** | Welcome & Language | `apps/user-web/src/App.vue` (헤더 툴바) | `VERIFIED` | 4개 국어(한국어, English, ภาษาไทย, 日本語) 즉시 변경 드롭다운. 선택 시 전 화면 번역 실시간 리렌더링. |
| **SCR-A03** | Login Dialog | `apps/user-web/src/App.vue` (`.auth-modal`) | `VERIFIED` | 이메일/비밀번호 로그인, LUNO 브랜드 모달, 원클릭 데모 계정(일반 유저, 앨리스, 관리자) 프리필 지원. |
| **SCR-A04** | Registration | `apps/user-web/src/App.vue` (`isRegisterMode`) | `VERIFIED` | 신규 회원가입 폼. 닉네임, 이메일, 패스워드 검증 및 즉시 JWT 토큰 발급. |
| **SCR-A05** | Account Verification | `apps/user-web/src/App.vue` | `PARTIAL` | 2단계 인증(TOTP) UI 구비. 백엔드 시크릿 연동 상태 표시. |
| **SCR-A06** | Profile Setup | `apps/user-web/src/App.vue` (`.settings-modal`) | `VERIFIED` | 프로필 사진, 표시 이름(`display_name`), 상태 메시지(`bio`), 핸들 ID 즉시 수정 및 D1 영구 저장. |
| **SCR-A07** | Permission Request | WebRTC Dialogs | `VERIFIED` | 마이크/카메라 접근 권한 요청 전 사용자 동의 다이얼로그 노출. |

---

### B. 메신저 영역 (Messenger Core)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-B01** | Chat List Panel | `apps/user-web/src/App.vue` (`.conversations-panel`) | `VERIFIED` | 좌측 대화방 목록. 1:1, 그룹 대화방 필터 탭(전체/친구/그룹/공식), 읽지 않은 메시지 뱃지, 실시간 소켓 동기화. |
| **SCR-B02** | Chat Search | `apps/user-web/src/App.vue` (`.chat-search-input`) | `VERIFIED` | 대화방 이름, 대화 상대 닉네임 실시간 인라인 필터링. |
| **SCR-B03** | One-to-One Chat | `apps/user-web/src/App.vue` (`.chat-window`) | `VERIFIED` | LUNO Deep Blue 발신 버블, 화이트 수신 버블, 시각적 꼬리 곡률(18px/4px), 시간 및 읽음 확인 표시. |
| **SCR-B04** | Group Chat | `apps/user-web/src/App.vue` (`.create-group-modal`) | `VERIFIED` | 다자간 그룹 생성, 그룹 참여자 아바타 클러스터 및 그룹 명칭 설정. |
| **SCR-B05** | Message Detail / Actions | `apps/user-web/src/App.vue` (`.message-row`) | `VERIFIED` | 메시지 호버 시 복사, AI 재번역, 삭제, 반응(Reaction) 툴바 노출. |
| **SCR-B06** | Attachments & Photos | `apps/user-web/src/App.vue` (`.file-preview`) | `VERIFIED` | 이미지, 첨부 파일 드래그앤드롭 업로드, 인라인 썸네일 미리보기 및 다운로드 링크. |
| **SCR-B07** | LUNO Orbit Crew Stickers | `apps/user-web/src/line-stickers.ts` | `VERIFIED` | 독자 벡터 캐릭터(Lumi, Nori, Poko) 스티커 팩 피커 팝업 및 대화방 실시간 전송. |
| **SCR-B08** | Read Status Tracker | `apps/user-web/src/App.vue` (`.read-badge`) | `VERIFIED` | 상대방의 메시지 수신 및 읽음 여부 `읽음` 라벨 실시간 갱신. |
| **SCR-B09** | Message Settings | `apps/user-web/src/App.vue` (`.chat-header-actions`) | `VERIFIED` | 대화방 알림 음소거, 대화 내용 검색, 통화 연결 바로가기. |

---

### C. 친구 관리 영역 (Contacts & Social)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-C01** | Contact List | `apps/user-web/src/App.vue` (`.friends-panel`) | `VERIFIED` | 내 프로필, 생일인 친구 섹션, 공식 계정(3개 채널), 친구 목록 가나다순 정렬 및 온라인 인디케이터. |
| **SCR-C02** | Friend Search & Add | `apps/user-web/src/App.vue` (`.friend-search-input`) | `VERIFIED` | LUNO ID 또는 이메일 검색을 통한 즉시 친구 추가 및 초대 링크 생성. |
| **SCR-C03** | Friend Invitation | `apps/user-web/src/App.vue` | `VERIFIED` | 고유 초대 URL 복사 및 QR 코드 초대 생성. |
| **SCR-C04** | Profile Detail Modal | `apps/user-web/src/App.vue` (`.profile-modal`) | `VERIFIED` | 친구 프로필 크게 보기, 1:1 대화 시작 버튼, 무료 음성/영상 통화 발신 버튼. |
| **SCR-C05** | Block & Report | `apps/user-web/src/App.vue` (`.block-btn`) | `PARTIAL` | 친구 차단 및 불량 사용자 신고 접수 UI (서버 차단 테이블 연계). |

---

### D. 음성 및 영상 통화 (Voice & Video Calls)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-D01** | Call Outgoing/Incoming | `apps/user-web/src/App.vue` (`.call-modal`) | `VERIFIED` | 발신/수신 링잉 다이얼로그, 상대방 아바타 펄스 애니메이션, 수락/거절 버튼. |
| **SCR-D02** | Voice Call View | `apps/user-web/src/App.vue` (`.active-call-view`) | `VERIFIED` | 통화 시간 타이머, 마이크 음소거, 스피커폰 제어. |
| **SCR-D03** | Video Call View | `apps/user-web/src/App.vue` (`.video-grid`) | `VERIFIED` | 상대방 메인 비디오 스트림 + 내 카메라 PiP(Picture-in-Picture) 레이아웃. |
| **SCR-D04** | Real-Time Subtitles | `apps/user-web/src/App.vue` (`.call-caption-stream`) | `VERIFIED` | 통화 중 실시간 양방향 다국어 AI 자막 스트림 오버레이 노출. |

---

### E. AI 기능 영역 (AI Translation & Intelligence)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-E01** | Real-Time Message Translation | `apps/user-web/src/App.vue` (`/api/v1/translate`) | `VERIFIED` | 채팅방 상단 `AI 자동 번역` 토글 시 수신/발신 메시지 자동 감지 및 인라인 번역 카드 렌더링. |
| **SCR-E02** | Target Language Picker | `apps/user-web/src/App.vue` (`.translation-lang-select`)| `VERIFIED` | 한국어(KO), 영어(EN), 태국어(TH), 일본어(JA) 즉시 변경 드롭다운. |
| **SCR-E03** | Manual Translate Action | `apps/user-web/src/App.vue` (`.translate-btn`) | `VERIFIED` | 개별 말풍선 하단 `[LUNO AI 번역]` 클릭을 통한 온디맨드 번역 트리거. |
| **SCR-E04** | AI System Bot | `apps/user-web/src/App.vue` (공식 채널) | `VERIFIED` | LUNO 공지봇, 스마트 어시스턴트 채널 대화 및 안내 제공. |

---

### F. 설정 및 접근성 (Settings & Accessibility)

| 화면 ID | 화면명 | 소스 컴포넌트 / 경로 | 구현 상태 | UX 인터랙션 및 LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-F01** | App Settings Dialog | `apps/user-web/src/App.vue` (`.settings-modal`) | `VERIFIED` | 테마 선택, 디바이스 보안, 프로필 관리, QR 연동 통합 허브. |
| **SCR-F02** | Display & Theme Picker | `apps/user-web/src/App.vue` (`.theme-selector`) | `VERIFIED` | LUNO 공식 라이트 모드 vs 미드나잇 다크 모드 즉각 전환. |
| **SCR-F03** | Font Size Scale | `apps/user-web/src/App.vue` (`data-font-scale`) | `VERIFIED` | 기본(100%), 크게(115%), 아주 크게(130%) 폰트 접근성 스케일링. |
| **SCR-F04** | Letter Sealing Status | `apps/user-web/src/App.vue` (`.security-badge`) | `VERIFIED` | Signal 프로토콜 기반 ECDH 단말간 암호화 적용 상태 및 키 핑거프린트 표기. |
| **SCR-F05** | QR Login Verification | `apps/user-web/src/App.vue` (`.qr-auth-box`) | `VERIFIED` | PC/웹 브라우저 로그인을 위한 챌린지 토큰 승인 인터페이스. |

---

### G. 5대 전문 관리 콘솔 (Administrative & Ecosystem Consoles)

| 화면 ID | 콘솔명 | URL 경로 및 소스 | 구현 상태 | LUNO 브랜드 시스템 적용 내용 |
|---|---|---|---|---|
| **SCR-G01** | Admin Console | `/admin` (`apps/admin-console`) | `VERIFIED` | LUNO 로고 헤더, `#315BCD` 테마, 전사 유저/메시지 모니터링 및 보안 감사. |
| **SCR-G02** | Partner Console | `/partner` (`apps/partner-console`) | `VERIFIED` | LUNO 비즈니스 파트너 인증, 공식 계정 봇 생성, API 웹훅 관리. |
| **SCR-G03** | Developer Console | `/developer` (`apps/developer-console`) | `VERIFIED` | LUNO OAuth 클라이언트 발급, REST API 키 및 SDK 다운로드 센터. |
| **SCR-G04** | Creator Console | `/creator` (`apps/creator-console`) | `VERIFIED` | LUNO 스티커 및 디지털 굿즈 등록/심사/정산 워크플로우. |
| **SCR-G05** | Ads Console | `/ads` (`apps/ads-console`) | `VERIFIED` | LUNO 타임라인 및 대화방 디스플레이 광고 캠페인 집행 및 ROAS 분석. |

---
*LUNO UI/UX Screen Inventory v1.0 © 2026 LUNO Global Platform Inc.*

