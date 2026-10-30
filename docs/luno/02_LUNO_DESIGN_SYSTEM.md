# LUNO Design System Specification v1.0
**Document Version:** 1.0  
**Effective Date:** 2026-10-30  
**Applicability:** `apps/user-web`, `apps/*-console`, Mobile & Web Frontends  
**Implementation Source:** `apps/user-web/src/styles/luno-design-tokens.css`

---

## 1. 시스템 아키텍처 및 원칙 (System Architecture)

LUNO Design System(LDS)은 일관성, 접근성, 확장성을 보장하기 위해 선언적 **CSS Custom Properties(Design Tokens)**를 기반으로 구축되었습니다.

### 1.1 핵심 원칙
1. **Token First**: 모든 색상, 치수, 폰트, 곡률, 그림자는 하드코딩된 값 대신 시맨틱 토큰 변수를 참조합니다.
2. **Accessible by Default**: 모든 컴포넌트는 WCAG 2.2 AA 기준(명도 대비 4.5:1 이상)을 충족하며 스크린 리더와 키보드 탐색을 지원합니다.
3. **Adaptive Form Factor**: 모바일 터치 환경(최소 44×44px 히트박스)부터 데스크톱 3-패널 환경까지 매끄러운 반응형 적응을 보장합니다.

---

## 2. 디자인 토큰 레퍼런스 (Design Tokens)

### 2.1 Color Tokens (라이트모드 vs 다크모드)

| 토큰명 | 라이트모드 값 | 다크모드 값 | 적용 대상 및 목적 |
|---|---|---|---|
| `--luno-primary` | `#4F7CFF` | `#4F7CFF` | 브랜드 대표 색상, 로고, 하이라이트 |
| `--luno-primary-hover` | `#3A68EE` | `#638DFF` | 브랜드 호버 인터랙션 |
| `--luno-primary-active` | `#2755D6` | `#7CA1FF` | 버튼 클릭/액티브 피드백 |
| `--luno-deep-blue` | `#315BCD` | `#3A68EE` | **Primary CTA 버튼, 발신 말풍선** |
| `--luno-sky` | `#8EC5FF` | `#1E3A8A` | 서브 액센트, 선택 항목 배경 |
| `--luno-mint` | `#5EE6C2` | `#34D399` | 온라인 상태 점, AI 번역 뱃지 |
| `--luno-bg-app` | `#F7FAFF` | `#0B1220` | 전체 애플리케이션 최하단 배경 |
| `--luno-bg-surface` | `#FFFFFF` | `#101B2F` | 카드, 채팅 목록 패널, 모달 본문 |
| `--luno-bg-elevated` | `#FFFFFF` | `#16233B` | 팝오버 메뉴, 툴팁, 플로팅 액션 |
| `--luno-bg-active` | `#EAF1FF` | `#1B2B47` | 선택된 채팅방/친구 목록 항목 |
| `--luno-border` | `#D9E1EC` | `#22334F` | 1px 라인 디바이더, 입력창 테두리 |
| `--luno-border-subtle` | `#EAEFF6` | `#19273C` | 연한 카드 구분선 |
| `--luno-text-primary` | `#14213D` | `#F7FAFF` | 1차 텍스트, 헤드라인, 보낸 사람 이름 |
| `--luno-text-secondary`| `#5B6475` | `#B8C5DB` | 2차 텍스트, 메시지 미리보기, 시간 |
| `--luno-text-muted` | `#8A94A6` | `#6B7C99` | 플레이스홀더, 비활성 캡션 |
| `--luno-bubble-me` | `#315BCD` | `#2D55C4` | 내 발신 메시지 버블 배경 (대비 6.46:1) |
| `--luno-bubble-me-text` | `#FFFFFF` | `#FFFFFF` | 내 발신 메시지 글자색 |
| `--luno-bubble-other` | `#FFFFFF` | `#1E2D45` | 상대방 수신 메시지 버블 배경 |
| `--luno-bubble-other-text` | `#14213D` | `#F7FAFF` | 상대방 수신 메시지 글자색 |

### 2.2 Typography Tokens

```css
--luno-font-family: 'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, 'Noto Sans Thai', 'Noto Sans JP', sans-serif;

/* 폰트 크기 */
--luno-font-display: 32px;
--luno-font-title: 24px;
--luno-font-section: 20px;
--luno-font-body-lg: 16px;
--luno-font-body: 14px;
--luno-font-caption: 12px;

/* 두께 */
--luno-weight-regular: 400;
--luno-weight-medium: 500;
--luno-weight-semibold: 600;
--luno-weight-bold: 700;
```

#### 접근성 폰트 스케일링 모드 (`data-font-scale`)
- `normal`: 100% 기준 크기
- `large`: 115% 크기 (고령자 및 저시력 사용자)
- `xlarge`: 130% 크기 (접근성 전용)

### 2.3 Spacing & Layout Tokens (8px Grid & 4px Micro-steps)

| 토큰명 | 값 | 주 사용처 |
|---|---|---|
| `--luno-space-1` | `4px` | 인라인 뱃지 내부 패딩, 아이콘-텍스트 간격 |
| `--luno-space-2` | `8px` | 리스트 항목 간 마진, 작은 버튼 패딩 |
| `--luno-space-3` | `12px` | 텍스트 인풋 상하 패딩, 말풍선 내부 마진 |
| `--luno-space-4` | `16px` | **기본 패딩**, 카드 패딩, 모바일 좌우 마진 |
| `--luno-space-5` | `20px` | 모달 헤더 여백, 섹션 간 간격 |
| `--luno-space-6` | `24px` | 데스크톱 패널 간격, 페이지 외부 여백 |
| `--luno-space-8` | `32px` | 스플래시 화면 간격, 랜딩 히어로 여백 |

### 2.4 Border Radius Tokens

| 토큰명 | 값 | 적용 컴포넌트 |
|---|---|---|
| `--luno-radius-sm` | `8px` | 툴팁, 작은 뱃지, 태그 |
| `--luno-radius-md` | `12px` | 입력창(Input), 작은 버튼, 드롭다운 메뉴 |
| `--luno-radius-lg` | `16px` | **주요 CTA 버튼, 메시지 버블** |
| `--luno-radius-xl` | `20px` | 모달 다이얼로그, 메신저 카드 컨테이너 |
| `--luno-radius-full` | `9999px` | 원형 아바타, 플로팅 액션 버튼(FAB), 필(Pill) 태그 |

### 2.5 Shadows & Elevation

```css
--luno-shadow-sm: 0 1px 3px rgba(20, 33, 61, 0.06);
--luno-shadow-md: 0 4px 12px rgba(20, 33, 61, 0.08);
--luno-shadow-lg: 0 12px 32px rgba(20, 33, 61, 0.12);
--luno-shadow-popover: 0 8px 24px rgba(20, 33, 61, 0.16);
```

---

## 3. 핵심 컴포넌트 상세 규격 (Component Specifications)

### 3.1 Button Component
- **Primary Button**:
  - 배경: `var(--luno-deep-blue)` (`#315BCD`)
  - 텍스트: `#FFFFFF`
  - 높이: 모바일 `48px`, 데스크톱 `42px` (최소 터치 44px 이상 만족)
  - 곡률: `14px`
  - 패딩: `0 20px`
  - 상태:
    - Hover: `background: #2755D6`
    - Active: `transform: scale(0.98)`
    - Disabled: `opacity: 0.45; cursor: not-allowed`
    - Loading: 텍스트 숨김 및 20px SVG 스피너 중앙 노출
- **Secondary Button**:
  - 배경: `var(--luno-bg-active)` (`#EAF1FF`), 텍스트: `var(--luno-deep-blue)`
- **Ghost / Icon Button**:
  - 투명 배경, `40×40px` 정사각형 히트 영역, 호버 시 `var(--luno-bg-active)` 0.12 투명도 적용.

### 3.2 Chat Bubble Component
- **Outgoing (내 메시지)**:
  - 배경: `var(--luno-bubble-me)` (`#315BCD`)
  - 텍스트: `#FFFFFF`
  - 곡률: `18px 18px 4px 18px` (우하단 꼬리 형태)
  - 메타데이터: 좌측 하단에 `읽음` 상태 및 12px 타임스탬프(`rgba(255,255,255,0.7)`) 표기
- **Incoming (상대방 메시지)**:
  - 배경: `var(--luno-bubble-other)` (`#FFFFFF` / 다크모드 `#1E2D45`)
  - 텍스트: `var(--luno-bubble-other-text)` (`#14213D` / 다크모드 `#F7FAFF`)
  - 테두리: 라이트모드 `1px solid var(--luno-border)`
  - 곡률: `18px 18px 18px 4px` (좌하단 꼬리 형태)
  - 메타데이터: 우측 하단에 12px 타임스탬프 표기

### 3.3 AI Translation Sub-Drawer (인라인 번역 서랍)
- 메시지 버블 바로 하단에 일체형으로 결합되는 번역 영역.
- 디자인:
  - 배경: `rgba(79, 124, 255, 0.08)` (소프트 LUNO 블루)
  - 테두리: `1px solid rgba(79, 124, 255, 0.2)`
  - 상단 뱃지: `[LUNO AI]` 뱃지 (민트 액센트 `#5EE6C2`)
  - 우측 액션: 언어 전환 및 재시도 아이콘 버튼

### 3.4 WebRTC Voice/Video Call Controls
- 모달 헤더: 실시간 AI 자막 스트림(`luno-call-caption-stream`) 영역 제공.
- 통화 버튼:
  - 오디오 토글: `52×52px` 원형 버튼 (활성: 다크블루 / 음소거: 슬레이트 그레이)
  - 비디오 토글: `52×52px` 원형 버튼
  - 통화 종료: `56×56px` 원형 버튼 (배경: `#EF4444` 에러 레드)
  - AI 실시간 자막 토글 스위치: 상단 우측 위치

### 3.5 Navigation Rail & Bottom Dock
- **Desktop Navigation Rail (68px 너비)**:
  - 최상단: LUNO 공식 워드마크/심볼
  - 아이콘 리스트: 친구, 대화, 통화, 설정
  - 활성 상태: 좌측 3px 인디케이터 바 및 배경 하이라이트
- **Mobile Bottom Navigation Dock (56px 높이)**:
  - 화면 하단 고정(`position: fixed; bottom: 0`)
  - 4개 균등 분할 탭 (홈/친구, 대화, 통화, 설정)
  - 최소 터치 영역 `48×48px`

---

## 4. 접근성 및 반응형 브레이크포인트 (Accessibility & Breakpoints)

### 4.1 미디어 쿼리 브레이크포인트

```css
/* Mobile First Base */
@media (min-width: 768px) {
  /* Tablet / Split-view */
}

@media (min-width: 1024px) {
  /* Desktop Full 3-Pane Layout */
}
```

- **모바일 (< 768px)**:
  - 단일 뷰 스택(Stack View). 채팅방 입장 시 전체 화면 전환 및 좌상단 `<` 뒤로가기 버튼 필수 노출.
- **데스크톱 (≥ 1024px)**:
  - 좌측 네비게이션 레일 (68px) + 중앙 대화 목록 패널 (320px) + 우측 대화 상세 패널 (유동폭 1fr).

---
*LUNO Design System Specification v1.0 © 2026 LUNO Global Platform Inc.*
