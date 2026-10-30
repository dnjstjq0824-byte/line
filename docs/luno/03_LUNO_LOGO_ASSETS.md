# LUNO Official Logo Assets & Visual Catalog v1.0
**Document Version:** 1.0  
**Effective Date:** 2026-10-30  
**Assets Location:** `assets/brand/luno/` (Master SVGs) & `apps/user-web/public/brand/` (Web Assets)  
**Generation Script:** `scripts/generate_luno_brand_assets.cjs`  

---

## 1. 브랜드 에셋 총괄 현황 (Asset Inventory)

LUNO 브랜드는 고해상도 벡터 표준(SVG)으로 제작된 21종의 마스터 그래픽 에셋을 보유하고 있습니다. 모든 에셋은 무손실 스케일링이 가능하며 웹 브라우저, 모바일 네이티브 앱(iOS/Android), 데스크톱 클라이언트에 즉시 배포 가능합니다.

---

## 2. 3대 로고 컨셉 시안 (Logo Concept Proposals)

PO 지시서 제5조 2항에 따라 3가지 독립적인 디자인 컨셉을 완벽히 수립하였습니다.

### 2.1 Concept B — LUNO Chat Symbol (★ 공식 채택안)
- **컨셉 정의**: 두 개의 라운드 말풍선이 겹쳐지며 중심부에 부드러운 연결 고리를 형성하는 형상.
- **의미**: "국경 없는 대화와 소통의 매개체(Connect Beyond Borders)"
- **채택 사유**: 24×24px의 극소형 파비콘 및 앱 아이콘에서도 즉각적인 실루엣 인지가 가능하며, 타 메신저와 명확히 차별화됨.
- **에셋 파일**:
  - `concept-b-chat-symbol-light.svg` (라이트모드: LUNO Deep Blue `#315BCD` & Mint `#5EE6C2`)
  - `concept-b-chat-symbol-dark.svg` (다크모드: LUNO Sky `#8EC5FF` & Deep Navy)
  - `concept-b-chat-symbol-mono.svg` (단색/흑백 모노크롬: `#14213D` / 인쇄용 `#000000`)

### 2.2 Concept A — LUNO Wordmark
- **컨셉 정의**: 기하학적 산세리프 폰트를 기반으로 곡률을 유기적으로 연마한 텍스트 워드마크.
- **에셋 파일**:
  - `concept-a-wordmark-light.svg`
  - `concept-a-wordmark-dark.svg`
  - `concept-a-wordmark-mono.svg`

### 2.3 Concept C — LUNO Connection
- **컨셉 정의**: 두 사람의 노드가 빛의 궤도(Orbit)로 연결되는 다차원 기하학적 심볼.
- **에셋 파일**:
  - `concept-c-connection-light.svg`
  - `concept-c-connection-dark.svg`
  - `concept-c-connection-mono.svg`

---

## 3. 공식 앱 및 플랫폼 배포 에셋 매핑 (Platform Asset Matrix)

| 용도 | 파일명 (Master & Web Public) | 해상도/비율 | 설명 및 렌더링 규격 |
|---|---|---|---|
| **웹 파비콘** | `luno-favicon.svg` | 1:1 (32×32) | 브라우저 탭 아이콘 (Concept B 심볼 기반) |
| **모바일 앱 아이콘** | `luno-app-icon.svg` | 1:1 (512×512) | 유니버설 앱 아이콘 (Deep Blue 그라디언트 + 심볼) |
| **iOS 앱 아이콘** | `luno-ios-icon.svg` | 1:1 (180×180) | iOS 홈 화면 Apple Touch Icon (둥근 마스크 대응) |
| **안드로이드 적응형 배경** | `luno-adaptive-background.svg` | 1:1 (432×432) | Android Adaptive Icon Background 레이어 |
| **안드로이드 적응형 전면** | `luno-adaptive-foreground.svg` | 1:1 (432×432) | Android Adaptive Icon Foreground 심볼 레이어 |
| **스플래시 화면** | `luno-splash.svg` | 9:19.5 (1080×2340) | 모바일/웹 초기 로딩 인트로 화면 |
| **공식 웹 로고** | `luno-web-logo.svg` | 4:1 (240×60) | 상단 글로벌 네비게이션 헤더용 로고 |
| **공식 워드마크** | `luno-wordmark.svg` | 3.5:1 (180×52) | 공식 문서 및 푸터용 텍스트 로고 |
| **단독 심볼** | `luno-symbol.svg` | 1:1 (64×64) | 툴바, 탭바, 프로필 기본 아바타 |
| **SNS 프로필** | `luno-sns-profile.svg` | 1:1 (800×800) | X(트위터), 인스타그램, 링크드인 공식 계정 프로필 |
| **OpenGraph 공유 이미지**| `luno-og-share.svg` | 1.91:1 (1200×630) | 메신저 링크 공유 시 노출되는 리치 프리뷰 카드 |
| **브랜드 배경 패턴** | `luno-pattern.svg` | 타일형 (400×400) | 대화방 커스텀 배경 및 마케팅 배너용 기하학 패턴 |

---

## 4. 에셋 무결성 검증 및 배포 확인

- **물리적 저장소 동기화**:
  - `c:\Users\dnjst\Desktop\project\line\assets\brand\luno\` (총 21개 파일 생성 확인)
  - `c:\Users\dnjst\Desktop\project\line\apps\user-web\public\brand\` (총 21개 파일 복제 완료)
  - `apps/user-web/dist/brand/` (Vite 빌드 아티팩트 배포 완료)
- **타사 저작권 침해 방지 검증**:
  - LINE의 초록색(`#00C300`), 카카오톡의 노란색(`#FEE500`), 텔레그램의 종이비행기 심볼을 완벽히 배제하고 순수 독자 제작된 LUNO Orbit Vector 심볼만 사용됨을 보증합니다.

---
*LUNO Official Logo Assets & Visual Catalog v1.0 © 2026 LUNO Global Platform Inc.*

