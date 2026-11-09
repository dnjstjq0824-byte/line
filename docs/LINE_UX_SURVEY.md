# LINE 메신저 UX/UI 전수 조사

**조사일**: 2026-11-09
**이미지**: `screenshots/line-reference/` 66장 (16.6MB) + `manifest.json` (출처 URL 포함)
**출처**: App Store JP, help.line.me (ko/en), guide.line.me (ja), wikiHow(서드파티 3장만)
**저작권**: 모든 이미지는 LY Corporation 등 원권리자 소유. 내부 레퍼런스용으로만 보관하며 재배포 금지.

## 1. 앱 하단 탭 구조 (2025 개편 이후)

| 순서 | 구 탭 | 신 탭 (개편) | 비고 |
|---|---|---|---|
| 1 | 홈 | 홈 | 프로필·친구·서비스 허브 |
| 2 | 토크 | 토크 | 대화 목록 |
| 3 | VOOM | 쇼핑 | VOOM은 TH에서 2026-09-28 종료. JP는 쇼핑+앱 탭 확인 |
| 4 | 뉴스 | 뉴스 | LINE NEWS/TODAY |
| 5 | 월렛 | 앱 | 월렛→앱 탭으로 교체 확인 (guideart_15) |

- 구 5탭(홈/토크/VOOM/뉴스/월렛): `guideart_04.png` 하단 내비에서 확인.
- 신 5탭(홈/토크/쇼핑/뉴스/앱): `guideart_15.png` 하단 내비에서 확인.
- LY 통합보고서 FY2024도 2025-07 이후 `Home/Chats/Shopping/News/Wallet` 순차 전환을 명시.

## 2. 앱 화면 인벤토리

### 2.1 홈 탭
- 상단: 내 프로필 칩 + 스티커/서비스/알림/설정 아이콘 (`guideart_15.png`, `guide_ja_signup_3.png`).
- 카드: 새 알림(친구 생일·프로필 업데이트), 서비스(스티커·테마·기프트).
- 친구 리스트: 친구 N명 + 미리보기 이름, 그룹 N개 + 미리보기 (아바타 콜라주).
- 하단: 콘텐츠 카드(트렌드·공식계정 추천).

### 2.2 토크(대화 목록) 탭
- 상단: 토크/친구 전환 칩 + 검색바 + QR 아이콘 (`guideart_04.png`).
- 스마트채널 광고 슬롯 1칸 + 생일 카드.
- 행 구성: 아바타, 이름(그룹은 인원수), 미리보기, 시간(당일 HH:MM·그 외 상대일).

### 2.3 대화방
- 헤더: 뒤로·이름·검색·통화·메뉴 (`appstore_02_JP.webp`, `appstore_03_JP.webp`).
- 날짜 디바이더(Today), 상대 흰색·내 녹색 말풍선, 시간은 말풍선 옆 소형 표기.
- 스티커(이펙트/아바타 변형 포함)가 말풍선 크기로 인라인 렌더.
- 입력바: +·카메라·앨범·텍스트·이모지·음성 순서.

### 2.4 통화
- 그룹 영상통화: 2열 그리드 + 뷰티/이펙트 (`appstore_04_jp.webp`).
- LINE Labs 통화 녹음 가이드 존재 (`linelabs-callrecording` 이미지 5장).

### 2.5 카메라
- 인앱 카메라: 이펙트 트레이 + 모드탭(아바타·사진·동영상·GIF) (`appstore_05_shot5.webp`).

### 2.6 친구 추가·계정·설정
- 친구 추가: SMS/메일 주소 시트 (`guide_ja_friends-and-groups_4.png`).
- 로그인 우선순위(KR): QR → 패스키 → 전화번호 → 다른 번호 → 이메일 → Apple/Google (`help_20000098_01.png`).
- 서브디바이스 선택 화면(EN): 메인/서브 선택 + OK (`pc_40~43.png`).
- 패스키·백업 PIN 가이드 (`passkey` 5장, `backup-pin` 5장).
- 대화 백업/복원·알림 설정 이미지 (`help_20020173_*`, `help_20000276_*`, 소형).

### 2.7 스티커·테마
- 스토어형 컬럼 아트 (`guide_ja_features-and-columns_3.png`, 902KB).
- 이펙트 스티커 실제 렌더 (`appstore_03_JP.webp`).

## 3. PC(데스크톱) 인벤토리

- 공식 PC = Windows/macOS 데스크톱 앱 (line.me 다운로드·MS Store `LINE Desktop`).
- PC에서 신규 가입 불가. 기존 모바일 계정으로 QR/이메일 로그인 (help 50001182 텍스트 확인).
- PC 레이아웃(서드파티 캡처, 구 UI): 좌측 아이콘 레일(프로필·대화·친구·통화) + 검색 + 프로필/친구 목록 2단 (`pcweb_08.jpg`).
- 서브디바이스 로그인 플로우: 공식 EN 스크린 4장 (`pc_40~43.png`).
- 웹브라우저 전용 클라이언트는 공식적으로 없음. 서드파티 "LINE Web" 주장 페이지는 로그인 제한(최근 2주 열람 등)을 언급하나 공식 문서 미확인.

## 4. 이미지 목록 (출처별)

| 파일 | 내용 (픽셀 확인) | 출처 페이지 |
|---|---|---|
| appstore_01_shot1.webp | LINE 아이콘 (화면 아님) | App Store JP |
| appstore_02_JP.webp | 대화방+이펙트 스티커 | App Store JP |
| appstore_03_JP.webp | 대화방+대형 스티커 | App Store JP |
| appstore_04_jp.webp | 그룹 영상통화 6분할 | App Store JP |
| appstore_05_shot5.webp | 인앱 카메라+이펙트 | App Store JP |
| help_20000098_01~06.png | 로그인 플로차트(KR) 외 5장 | help 20000098 |
| help_20000276_01/02/05.png | 알림 설정 소형 3장 | help 20000276 |
| help_20001192_01.png | 가입 안내 소형 1장 | help 20001192 |
| help_20020173_01/02.png | 백업/복원 소형 2장 | help 20020173 |
| help_50000087_02.png | Letter Sealing 안내 1장 | help 50000087 |
| help_20018574_02.png | 서브디바이스 안내 1장 | help 20018574 |
| guide_top_02~10 (8장) | 가이드 포털 헤더/카드 (주제별) | guide.line.me/ja/ |
| guide_ja_features-and-columns_2~4.png | 스티커 특집 아트 3장 | guide 특집 |
| guide_ja_update_3.png / _4.jpg | 업데이트 안내 2장 | guide 업데이트 |
| guide_ja_signup_3/4.png | 홈탭 프로필 설정 2장 | guide 가입 |
| guide_ja_friends-and-groups_4.png | 친구추가 SMS/메일 시트 | guide 친구 |
| guideart_02~06.png (5장) | 토크탭 리뉴얼 2025 (대화목록 포함) | guide chat-renewal2025 |
| guideart_08~10.png (3장) | 대화 미리보기 | guide chatpreview |
| guideart_14~18.png (5장) | 통화 녹음 (홈탭 포함) | guide callrecording |
| guideart_20~24.png (5장) | 패스키 설정 | guide passkey |
| guideart_26~30 (5장) | 백업 PIN | guide backup-pin |
| guideart_36.jpg | 위성모드 특집 | guide satellitemode |
| pc_40~43.png (4장) | 서브디바이스 로그인 플로우(EN) | help 20018574/sp |
| pcweb_04/06/08.jpg (3장) | PC 클라이언트 캡처(서드파티, 구 UI) | wikiHow PC 통화 |

상세 URL은 `screenshots/line-reference/manifest.json` 참조.

## 5. LUNO 대비 갭 (요약)

1. 하단 탭: LUNO(홈·대화·피드·라운지·뉴스)와 LINE(홈·토크·쇼핑·뉴스·앱)이 다름. 개편 추종 여부는 별도 결정 필요.
2. 대화방: 말풍선/시간 표기·입력바 순서는 유사. 날짜 디바이더·이펙트 스티커·인앱 카메라는 없음.
3. 대화 목록: 스마트채널 슬롯·생일 카드·그룹 인원수 표기 없음.
4. 통화: LUNO 모바일은 시그널링만. 이펙트·녹음 없음.
5. 계정: 패스키·서브디바이스·QR 승인(LUNO는 QR 승인 구현済) — 패스키 없음.
6. PC: LUNO 데스크톱 앱 별도. PC 3단 레이아웃은 user-web과 유사.

## 6. 한계

- PC 앱 내부 최신 화면은 미확보 (MS Store JS 렌더·계정 로그인 필요). 구 UI 서드파티 캡처로 대체.
- 로케일 혼합 (JP/KR/EN). KR 앱 화면은 도움말 위주.
- 마케팅 프레임 포함 이미지는 UI 크롭이 아님. 픽셀 확인 13장, 나머지는 출처 주제 기준 분류.

## 7. 반영 상태 (2026-11-09, 단계별)

- P1 대화방·목록 소형 패리티: 모바일 대화 목록 시간+그룹 인원수, 대화방 날짜
  디바이더+말풍선 옆 시간, 홈 생일 카드. 웹은 조사 당시 이미 보유(디바이더·
  인원수·시간) + 친구 행 생일 배지 추가. 백엔드 `users.birthday` (MM-DD) +
  `birthday_today` 양쪽 패리티 (Go 007 마이그레이션, 워커 기존 동작 테스트 고정).
- P2 하단 탭: 모바일 4탭(홈·대화·뉴스·통화) → LINE 5탭(홈·토크·쇼핑·뉴스·앱).
  통화는 앱 디렉토리로 이동. 쇼핑 탭은 커머스 백엔드가 없어 정직한 "준비 중"
  표시. 웹 PC 3단 레이아웃은 변경 없음(§5-6, LINE PC와 유사).
- P3 패스키: 등록 세리머니 완료 (P3a). Go는 go-webauthn 검증 라이브러리,
  워커는 Web Crypto 직접 구현 (none+packed self, ES256). 챌린지 단일사용·5분
  TTL, RP ID·origin은 요청 호스트에서 유도. 웹 설정에 등록 UI. 로그인
  세리머니 (P3b) + 모바일은 미착수.
- P4 미디어 (미착수): 인앱 카메라 이펙트, 통화 이펙트/녹음, 음성 메시지,
  이펙트 스티커, 쇼핑 백엔드, 스마트채널 광고 백엔드. 네이티브·미디어 처리 필요.
