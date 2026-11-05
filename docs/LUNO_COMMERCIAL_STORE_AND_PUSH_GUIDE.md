# LUNO 글로벌 메신저 — 상용 스토어 배포, 푸시/CallKit 및 B2B CRM 운영 가이드

**문서 번호:** LUNO-PROD-GUIDE-2026-11  
**발행일:** 2026-11-05  
**대상 시스템:** LUNO Global Messenger (Cloudflare Workers 엣지 + Go 백엔드 + Vue 6개 포털 + Flutter 모바일)

---

## 1. 개요

본 문서는 LUNO 메신저의 상용 프로덕트 운영을 위해 구축된 4대 핵심 엔터프라이즈 기능의 아키텍처 및 스토어 제출/운영 절차를 규정합니다.

1. **[Track 1] 모바일 앱 스토어 배포 패키징**: Google Play (AAB) 및 Apple App Store (iOS Runner) 규격
2. **[Track 2] 백그라운드 푸시 & CallKit 통화 수신**: FCM Data Push 및 APNs VoIP PushKit 아키텍처
3. **[Track 3] 실시간 클러스터 & Durable Objects**: 글로벌 동시접속 Isolate 무지연 동기화
4. **[Track 4] 공식 계정(OA) 리치 메뉴 & 챗봇 CRM**: 파트너 센터 비주얼 디자이너 및 메신저 실동작

---

## 2. [Track 1] 모바일 앱 스토어 배포 규격

### 2-1. Android (Google Play Console)
- **패키지 식별자:** `com.bookingnetwork.messenger.global_messenger`
- **버전:** `versionName: 2.0.0`, `versionCode: 2001`
- **Android TargetSDK:** `35` (Android 15 Google Play 2026 규정 준수)
- **최소 SDK:** `minSdkVersion: 24` (Android 7.0 이상 전 기기 지원)
- **멀티 ABI 지원:** `arm64-v8a`, `armeabi-v7a`, `x86_64` (Google Play AAB가 기기별 최적 분할 APK 자동 생성)
- **릴리스 서명 키스토어:**
  - 경로: `~/.luno-signing/luno-release.jks`
  - 알고리즘: RSA 4096-bit (PKCS12)
  - 지문 (SHA-256): `6D:CD:CD:38:DB:6A:48:5C:E9:99:FE:EC:9D:B5:8F:E5:CD:C7:80:63:16:AA:63:6A:56:90:8B:FD:F0:BA:64:F0`
- **필수 권한 (AndroidManifest.xml):**
  - `android.permission.POST_NOTIFICATIONS` (Android 13+ 알림)
  - `android.permission.MANAGE_OWN_CALLS` (Android 통화 연동)
  - `android.permission.RECORD_AUDIO`, `CAMERA` (음성/화상 통화)
  - `android.permission.FOREGROUND_SERVICE_*` (통화 백그라운드 유지)

### 2-2. iOS (Apple App Store)
- **번들 식별자:** `com.bookingnetwork.messenger.globalMessenger`
- **최소 배포 타깃:** iOS 14.0+
- **Background Modes (Info.plist):**
  - `voip`: Apple PushKit을 통한 수신 전화 시 CallKit 즉시 기동
  - `remote-notification`: FCM/APNs 백그라운드 데이터 푸시
  - `audio`: 통화 중 잠금 화면 유지 및 백그라운드 오디오 세션
  - `fetch`: 백그라운드 대화 차분 동기화
- **개인정보 보호 권한 설명(Info.plist):**
  - `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription` 완비

---

## 3. [Track 2] 백그라운드 푸시 & CallKit 통화 아키텍처

```
[수신자 기기 화면 잠금/앱 종료 상태]
       ▲
       │ 1. VoIP Push (APNs) / High-priority Data (FCM)
       │
[Cloudflare Edge / Go Push Dispatcher]
       ▲
       │ 2. POST /api/v1/calls (kind: voice/video)
       │
[발신자 전화 걸기]
```

1. **전화 수신 (CallKit / ConnectionService):**
   - 발신자가 `POST /api/v1/calls`를 호출하면 서버는 `callkit` 페이로드(`uuid`, `handle`, `hasVideo`, `localizedCallerName`)를 포함하여 수신자의 등록된 `voip_token`으로 푸시를 즉시 발송합니다.
   - 수신자 스마트폰은 화면이 잠겨 있어도 통신사 전화와 동일하게 전체 화면으로 수신 UI가 기동됩니다.
2. **메시지 알림 (FCM / APNs):**
   - 수신자가 오프라인인 경우 `push_tokens` 테이블에 등록된 토큰으로 알림 배너를 디스패치합니다.

---

## 4. [Track 3] 실시간 클러스터 & Durable Objects

- **Cloudflare Durable Objects (`UserSocketHub`):**
  - 사용자당 하나의 고유 DO 인스턴스(`idFromName(userId)`)가 멀티 디바이스의 웹소켓 연결을 소유합니다.
  - WebSocket Hibernation API를 활용하여 유휴 상태에서는 컴퓨팅 비용이 0으로 수렴하며, 메시지 수신 시 엣지 Isolate에 무지연 브로드캐스트를 수행합니다.
- **D1 델타 동기화 페일오버:**
  - `GET /api/v1/conversations/:cid/sync?since_sequence=<N>` 엔드포인트를 통해 일시적인 네트워크 순단 복구 시 유실 없이 100% 메시지를 복원합니다.

---

## 5. [Track 4] 공식 계정(OA) 리치 메뉴 & 챗봇 CRM

### 5-1. 파트너 센터 비주얼 디자이너 ([`/partner/`](https://line-messenger.dnjstjqppk.workers.dev/partner/))
- **리치 메뉴 템플릿:** 2×3 그리드(6칸) 및 1×3 그리드(3칸) 지원.
- **타일별 액션:**
  - `메시지 전송 (message)`: 사용자가 타일을 터치했을 때 특정 키워드를 대화방에 자동 전송 → 연계된 챗봇이 자동 응답.
  - `웹링크 열기 (uri)`: 공식 몰, 이벤트 페이지 등으로 즉시 새 창 열기.
- **챗봇 키워드 자동응답 (CRM):**
  - 키워드 룰 빌더: 단어(예: "배송", "쿠폰", "공지사항") 입력 시 챗봇이 실시간 매칭하여 자동 답변.
  - 실시간 시뮬레이터 내장으로 배포 전 사전 테스트 가능.

### 5-2. 메신저 대화방 리치 메뉴 UI ([`https://line-messenger.dnjstjqppk.workers.dev/`](https://line-messenger.dnjstjqppk.workers.dev/))
- 공식 계정(`oa-notice`, `oa-weather`, `oa-deals`) 입장 시 하단 입력창 상단에 인터랙티브 리치 메뉴가 렌더링됩니다.
- "▲ 메뉴 열기 / ▼ 메뉴 닫기" 토글을 지원하여 채팅창 화면을 가리지 않고 자유롭게 여닫을 수 있습니다.
- 타일 터치 시 챗봇 자동응답이 대화방에 즉각 수신됩니다.
