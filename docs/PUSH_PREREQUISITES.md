# 푸시 알림 전제조건 (P0-6, 외부 연동 대기)

앱에는 푸시 수신 코드가 없음(FCM/APNs 플러그인·토큰 등록 없음 — 감사 확정).
아래가 갖춰지기 전에는 코드 작업을 시작하지 말 것(google-services.json 없이
firebase_messaging를 넣으면 Android 빌드가 깨짐).

## 필요물 (사용자/PO 준비)

1. Firebase 프로젝트 1개 + Android 앱 등록 (`com.bookingnetwork.messenger.global_messenger`)
2. `google-services.json` → `mobile/flutter_app/android/app/`에 배치
3. APNs 키 1개(.p8) → Firebase 콘솔에 등록(iOS 푸시용)
4. `GoogleService-Info.plist` → `mobile/flutter_app/ios/Runner/`에 배치
5. 발송 주체 결정: 워커에서 FCM HTTP v1 직접 호출 vs Go 서버 경유

## 있은 뒤 작업 (착수 시)

- 앱: `firebase_messaging` + `flutter_local_notifications` 추가, 로그인 후
  토큰 발급 → `POST /api/v1/push-tokens` 신규 endpoint로 등록(워커에 추가),
  포그라운드 수신 시 뱃지/인앱 표시, 탭 시 해당 대화방 딥링크(`/chats/:id`).
- 서버: 메시지 작성 경로에서 수신자 토큰 조회 → FCM 발송(실패는 로그만,
  전송 성공과 분리). D1에 토큰 테이블(마이그레이션 PO 승인 필요).
- 검증: 실기기 2대로 백그라운드 수신·뱃지·딥링크 확인. 에뮬레이터는
  터치 주입 고장으로 운전 불가(2026-11-10 확인) — 이 항목은 실기기 필수.

## 참고

- 과거 가짜 FCM 토큰 코드는 정직스윕에서 제거됨. 새로 넣는 토큰 경로는
  전부 실제 등록·실제 발송으로만 구현할 것.
