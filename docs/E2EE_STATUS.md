# F11 E2EE 완료 보고서 (E1–E10)

작성: 2026-11-21 / 대상: Stage 10 F11 E2EE 카드 전량
결론: **구현 완료.** 1:1·그룹·Keep 종단간 암호화가 웹·앱·서버에
걸쳐 동작하고, 전 게이트가 녹색이다. 강제 플래그는 아직 OFF이며,
외부 보안 감사는 받지 않았다(내부 검토 상태로 표기).

대표 결정(2026-11-21, 반영됨): E2EE 착수 확정 / 새 기기에 과거
기록 제공(복원 문구 백업) / 보안 검토는 내부만.

## 0. 게이트 현황 (E10 최종)

- 서버: `node --test scripts/*.test.mjs` 709/709
  (`e2ee_enforce` 6, `e2ee_vectors` 11, `e2ee_flow` 3,
  `e2ee_cross` 1, `e2ee_group` 3, `e2ee_files` 1,
  `e2ee_impacts` 5, `e2ee_backup` 4, `e2ee_keylife` 4 포함)
- 앱: `flutter test` 454/454, `flutter analyze` 무결함
- 웹: `vue-tsc --noEmit` 무결함, `vite build` 성공,
  `i18n_scan` TOTAL 0
- Go: `go test ./internal/server/ -run 'Consent|AgeOnDate'` 통과
- 약관: terms/privacy `2026-11-21.1` (서버·Go·테스트·HTML 8종 일치)

## 1. 카드별 내역 (커밋)

- E1 `9f89b95`: `docs/E2EE_DESIGN.md` — 범위·위협 모델·암호 구성·
  형식·백업·키 수명·서버 강제·기존 기능 영향·테스트 전략.
- E2 `b2e6092`: 서버 키 디렉터리(D1 `e2ee_keys`, 기기별 번들,
  prekey 서명 검증), `ciphertext` 강제(`E2EE_CIPHERTEXT_REQUIRED`),
  `APP_MIN_BUILD` 426 차단, 키 변경 `security_notice`+감사.
- E3 `e10e8a5`: 웹 프로토콜 `apps/shared/e2ee/` (X3DH·Double
  Ratchet·sender key·backup·envelope) + 공유 테스트 벡터
  (`scripts/fixtures/e2ee_vectors.json`, 11/11).
- E4 `415947f`: Dart 포트 `mobile/flutter_app/lib/e2ee/` +
  `test/e2ee_vectors_test.dart` 11/11 (동일 벡터).
- E5 `7ee8258`: 1:1 송수신(웹·앱, 다기기 fanout `{v:1,
  from, msgs}`, 수정·회수·답장)·서버 D1 평문 잔류 검증.
- E6 `20efde0`: 그룹 Sender Keys + `luno_sk_parcels` 릴레이
  (멤버십 검사, 퇴장 시 전원 교체) + Keep sealing.
- E7 `0f780d9`: 첨부 — 파일당 무작위 256비트 키 AES-256-GCM,
  키·IV·해시는 암호화 본문 안, R2에는 암호문만, 썸네일
  파이프라인 없음(해당 조항 N/A).
- E8 `2556d5a`: 기존 기능 영향 — 푸시 본문 "새 메시지" + 기기
  로컬 복호화 표시, 서버 검색 `ciphertext` 제외 + 기기 내
  검색, 링크 미리보기 기본 OFF + 탭당 동의, 번역·STT 요청당
  안내(자동번역은 sealed 제외), 신고 복호화 첨부 동의 게이트,
  기기 대화 내보내기(웹·앱), 관리자 열람 불가 표기.
- E9 `e24cc4a`: 키 관리 UX — 보안 코드(60자리·양쪽 대칭·
  인증/변경 표시), 내 기기 목록·원격 키 삭제, 복원 문구
  백업·복원·삭제(키+세션+sender key+기록 스냅샷),
  기기 추가·삭제 `security_notice`, 로그아웃 전체 wipe 검증.
- E10 (본 커밋): "준비 중/실험적/다음 업데이트" 문구 제거,
  약관 `2026-11-21.1` 교체(한·영·일·태 8종),
  내부-검토 표기, 본 보고서.

## 2. 강제·배포 상태

- `E2EE_ENFORCED` 미설정, `APP_MIN_BUILD` 미설정 — 강제
  코드는 있으나 휴면. 클라이언트는 키가 있으면 방 종류와
  무관하게 sealed 송신을 시도하고, 서버는 강제 OFF 시
  평문·암호문을 모두 받는다.
- 강제 ON 전환 시: 대상 방 평문 400, 구버전 앱 426 — 별도
  롤아웃 계획(공지·구앱 유도 확인) 후 전환할 것.

## 3. 알려진 제한·후속 과제 (미해결)

1. 외부 보안 감사 미실시 — F11 대표 결정(내부만)에 따라
   설정 화면에 "외부 보안 감사를 받지 않았습니다" 표기.
2. 보안 코드 QR 없음 — 60자리 숫자 대조만 제공. QR 표시·
   스캔은 후속.
3. 백업 기록은 방당 최신 200건·클라 8MB (설계 목표 방당
   2000건은 페이징 백업 후속 과제). 서버 상한 20MB.
4. 봇 초대 시 평문 전환 확인 UX 미구현 (설계 §1 요구).
5. 방 간 `ciphertext` 전달은 수신 측 세션이 없어 복호화
   불가 — 차단·안내 UX 미정.
6. sealed 동영상 임시 파일(`sealed-*.mp4`) 정리 수명 미감사.
7. `skParcels` 메모리 폴백은 읽을 때만 7일 정리 (고 churn
   방 누적 가능).
8. 로그아웃 wipe는 E9 이후 인덱스분만 완전 삭제 (E9 이전
   고아 세션 키 잔류 가능).
9. v1 래칫 헤더 평문 (개수 메타만 노출, 위협 모델 범위 안
   문서화) — 헤더 암호화는 추후 버전.
10. 백업 보유자의 과거 해독 가능 (순방향 비밀성 약화) —
    대표 결정 절충, 설계 §2에 명시.
11. 관리자 콘솔 `vue-tsc`의 공유 e2ee `.ts` 확장자 오류
    14건은 E3부터의 비게이트 기존 이슈 (본 작업 무관).

## 4. 검증 증거 위치

- 서버: `scripts/e2ee_*.test.mjs`, `scripts/fixtures/`
- 웹: `apps/shared/e2ee/`, `apps/user-web/src/e2ee/`,
  `E2eeSettings.vue`, 보안 코드 모달(`MessengerView.vue`)
- 앱: `mobile/flutter_app/lib/e2ee/`,
  `lib/pages/e2ee_settings.dart`, `lib/pages/safety_number.dart`
- 약관: `apps/user-web/public/legal/*.html` (8종),
  `LEGAL_VERSIONS`(`scripts/cf_worker.js:81`,
  `backend/internal/server/consent.go:12-15`)
