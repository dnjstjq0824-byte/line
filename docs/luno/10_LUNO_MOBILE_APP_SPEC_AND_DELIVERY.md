# [LUNO GLOBAL MESSENGER] 모바일 네이티브 앱 구현 및 배포 명세서
**문서 버전:** v1.0  
**발행일:** 2026-10-31  
**발행 주체:** LUNO Lead Mobile Architect & PO Team  
**대상:** 전체 개발팀, 모바일 클라이언트 테스터, 프로덕트 오너  

---

## 1. 개요 및 모바일 전환 배경

본 문서는 사용자의 "이제 실제 모바일 앱으로 구현해야 되지 않겠어?" 지시 및 PO Master 작업지시서 v1.0에 따라 개발된 **LUNO Global Messenger 네이티브 모바일 애플리케이션 (`mobile/flutter_app/`)**의 상세 구현 내역 및 테스트 결과를 기록합니다.

웹 브라우저 환경(`https://line-messenger.dnjstjqppk.workers.dev`)과 연동되는 고성능 크로스 플랫폼 네이티브 클라이언트를 완성하였으며, 기존의 잔여 레거시 브랜딩 및 컬러를 PO 지침에 맞추어 완벽히 전환하였습니다.

---

## 2. 브라우저 캐시 및 웹 환경 점검 보고

사용자가 첨부한 화면 캡처 분석 결과:
1. **발생 현상:** 사용자의 크롬 브라우저 탭에 이전 세션에 로드되었던 페이지 및 설정 모달("라인 환경설정 & 테마")이 메모리에 유지되어 표시됨.
2. **배포 현황 확인:**
   - Cloudflare Worker (`line-messenger.dnjstjqppk.workers.dev`) 프로덕션 엣지는 이미 LUNO 배포판이 정식 배포되어 서비스 중 (`<title>LUNO — Connect Beyond Borders</title>`, LUNO Favicon, LUNO Deep Blue `#315BCD` 테마).
   - 브라우저 강력 새로고침(`Ctrl + Shift + R` 또는 `Ctrl + F5`) 수행 시 최신 LUNO 인터페이스로 즉시 전환됩니다.

---

## 3. LUNO 모바일 디자인 시스템 및 토큰 적용

| 토큰명 | 색상 코드 | 용도 | 적용 컴포넌트 |
|---|---|---|---|
| **LUNO Deep Blue** | `#315BCD` | 메인 브랜드 액션, 상단 앱바 | AppBar, Primary 버튼, 활성 버블, 강조 |
| **LUNO Blue (Primary)** | `#4F7CFF` | 메인 브랜드 컬러 | 아바타 배경, 배지, 주요 링크 |
| **LUNO Mint** | `#5EE6C2` | 서브 강조, 보안/보조 | 브랜드 로고 칩, 충전 버튼, E2EE 자물쇠 |
| **LUNO Sky** | `#8EC5FF` | 보조 컬러, 포인트 | 포인트 배지, 읽음 카운트 |
| **Midnight Navy** | `#14213D` | 메인 텍스트 | 제목, 본문, 입력 필드 텍스트 |
| **Cloud White** | `#F7FAFF` | 앱 배경 | 스캐폴드 배경, 입력 필드 배경 |
| **Light Blue** | `#EAF1FF` | 활성 카드, 타인 버블 | 프로필 카드, 답장 바, 라운지 칩 |
| **Mist Gray** | `#D9E1EC` | 테두리, 구분선 | 카드 테두리, 디바이더, 텍스트 필드 외곽선 |
| **Slate Gray** | `#5B6475` | 보조 텍스트 | 상태메시지, 힌트, 날짜/시간 |

---

## 4. LUNO Orbit Crew 공식 캐릭터 스티커 팩 (저작권 침해 0%)

기존 타사 캐릭터를 전면 대체하고 LUNO 고유의 우주 탐험대 마스코트 팩을 모바일 클라이언트에 내장 탑재:

1. 🛸 **Lumi (루미)** — 호기심 많은 우주 탐험가 (`lumi_hi`: "안녕!")
2. 🪐 **Nori (노리)** — 따뜻한 토성 행성 (`nori_warm`: "최고야!")
3. 💫 **Poko (포코)** — 반짝이는 별빛 요정 (`poko_love`: "반짝여!")
4. 🚀 **Luno (루노)** — 신속한 로켓 파일럿 (`luno_cheer`: "화이팅!")
5. ☄️ **Comet (코멧)** — 쾌활한 혜성 (`comet_laugh`: "ㅋㅋㅋ")
6. 👨‍🚀 **Astro (아스트로)** — 예의 바른 우주비행사 (`astro_bow`: "감사합니다")

---

## 5. 모바일 네이티브 탭 구조 (Material 3 Navigation Bar)

1. **탭 0: 홈 / 친구 (`Icons.person`)**
   - LUNO 프로필 카드 (상태메시지, LUNO Keep 바로가기)
   - 실시간 친구/아이디 검색 및 원클릭 친구 추가
   - 24시간 LUNO 스토리 가로 슬라이더
   - 공식 인증 채널 목록 & 내 친구 목록
2. **탭 1: 대화 (`Icons.chat_bubble`)**
   - 실시간 대화방 목록 (읽지 않은 메시지 LUNO Deep Blue 배지)
   - 1:1 채팅 & 그룹 채팅 진입
3. **탭 2: 피드 (`Icons.play_circle`)**
   - 소셜 타임라인 포스트 작성 및 실시간 피드
   - 좋아요(하트) 및 댓글 카운터
4. **탭 3: 라운지 (`Icons.forum`)**
   - 글로벌 오픈 커뮤니티 라운지 참여
   - 실시간 참여자 수 및 관심사별 토론방
5. **탭 4: LUNO Pay (`Icons.account_balance_wallet`)**
   - 핀테크 머니 잔액 (`₩ 54,000`) 및 LUNO 포인트 (`1,250 P`)
   - 간편 머니 충전 및 채팅방 내 원클릭 송금 기능
6. **탭 5: 설정 (`Icons.settings`)**
   - **LUNO AI 실시간 번역 엔진 연동**: 새 메시지 수신 시 6개 국어(한국어, 영어, 태국어, 일본어, 중국어, 스페인어) 자동 번역 토글 및 기본 대상 언어 선택
   - **PC/웹 QR 로그인 승인**: 모바일에서 웹 클라이언트 데스크톱 QR 코드를 즉시 인증/승인
   - **Letter Sealing (종단간 E2EE)**: Signal X3DH + Double Ratchet 암호화 활성화 상태 토글
   - **GDPR 데이터 아카이브 다운로드**: 내 대화, 친구, 프로필 데이터 전체 백업

---

## 6. 대화방 내 특화 기능

- **LUNO AI 실시간 번역 인라인 뷰**: 메시지 하단의 번역 아이콘(🌐) 터치 시 엣지 AI 서버(`/api/v1/translate`)를 호출하여 `[LUNO AI] KO` 번역 박스 즉시 출력
- **메시지 전송 취소(Unsend)**: 내가 보낸 메시지 24시간 이내 삭제 및 실시간 소켓 브로드캐스트 동기화
- **실시간 리액션**: 6종 리액션(❤️, 👍, 😂, 😮, 😢, 🔥) 원클릭 등록
- **메시지 상단 공지 고정(Pin)**: 중요한 메시지를 채팅방 상단에 핀으로 고정
- **LUNO Keep 저장**: 대화 내용을 개인 보관함에 즉시 스크랩
- **오프라인 델타 동기화**: 네트워크 재연결 시 누락된 시퀀스 메시지 자동 보정

---

## 7. 테스트 및 빌드 산출물

- **테스트 결과**: `mobile/flutter_app/test/messenger_test.dart`
  - 4개 테스트 케이스 100% 통과 (Brand UI, Color Tokens, Orbit Crew 6종, Api Client Production Gateway)
- **빌드 산출물**:
  - Android APK: `mobile/flutter_app/build/app/outputs/flutter-apk/app-debug.apk`
  - 패키지명: `luno_messenger (v2.0.0+1)`
  - 최소 지원 SDK: Android API 21 (Lollipop) 이상, iOS 12.0 이상 지원

