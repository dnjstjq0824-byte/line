# LUNO 상용화 보고서 (Phase 0~5)

- 기준 커밋: 본 미션 작업분(라우터 분리·i18n·앱캡처·지갑/푸시 정합·MessengerView i18n 462→0·관리자 샷 포함, 커밋 예정)
- 일자: 2026-11-07 / 원칙: 계약·결제 일절 진행 없음(§11 준수)
- 관련 산출물: [Phase 0 진단서](COMMERCIALIZATION_PHASE0_DIAGNOSIS.md),
  [i18n 인벤토리](i18n-hardcoded-inventory.md)(TOTAL 0), `screenshots/phase3/`(49장+manifest+EN 7장),
  `screenshots/app/`(21장+manifest), `screenshots/admin/`(2장+manifest), `screenshots/perf/lcp.json`,
  `scripts/capture_screenshots.mjs`·`scripts/capture_app.mjs`·`scripts/measure_lcp.mjs`(재현 도구)

## 1. 현황 진단표

| 표면 | 규모 | 동작 | 부분 | 더미 | 깨짐 | 진단 후 조치 |
| --- | --- | --- | --- | --- | --- | --- |
| user-web 화면 29 | 29 | 22 | 4 | 2 | 1(충전 봉인) | P0 12건 해소, 잔여 3건 P1 |
| 콘솔 화면 25 | 25 | 22 | 3 | 0 | 0 | rich-menu/bot-rules 서버 구현, admin UI베이스 적용 |
| 앱 24라우트 | 24 | 20 | 3 | 1 | 0 | Keep 경로 교정, Keep에 Harbor 위젯 적용 |
| API 149→158 | 158 | 149 | 9 stub | 0 | 0 | 10개 신규 라우트 + 응답 확장 2건 |
| DB 97T | 97 | 97 | 0 | 0 | 0 | 컬럼 2개(001+006), 시드 0건 유지 |

## 2. 반응형 검수 결과표

웹 49샷 모두 가로 스크롤 없음·콘솔 에러 0건(manifest.json 기계 판정).
육안 확인 7장: chats_pc_1440, settings_pc_1440(모달 정상),
admin_login_pc_1440(신규 BaseButton 렌더), wallet_mobile_390(하단내비 정상),
chats_tablet_768(768은 데스크톱 레일 구간임 확인), auth_en_pc_1440(영문
인증 화면, AuthView i18n 전환 회귀), 딥링크 2종(SPA 폴백 정상).
앱 21샷(Flutter web 빌드+로컬 Go+임시 sqlite, 실 UI 로그인 경유) 모두
가로 스크롤 없음·콘솔 에러 0건. 육안 확인 4장: login_mobile_390,
home_mobile_390(빈 친구 목록), chats_mobile_390(빈 상태 문구),
wallet_mobile_390(신규 계정 ₩0·0P 표시 확인).

| 페이지 | 1440 | 1280 | 1024 | 768 | 390 | 360 | 비고 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| auth | ✓ | — | — | ✓ | ✓ | ✓ | 콘솔 로그인 5종도 1440/390 ✓ |
| chats | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | 육안 2장 |
| friends/news/calls/wallet | ✓ | ✓ | ✓ | — | △ | △ | 768↓는 chats+wallet만(모바일 내비) |
| settings/addfriend 모달 | ✓ | ✓ | ✓ | ✓ | — | — | 셀렉터 2회 수정 후 정상(보고서 기록) |

△=해당 구간 미촬영이 아니라 모바일 내비 한계로 wallet만 촬영. 미달: Flutter
실기기/네이티브 샷(웹 빌드 렌더로 대체, CanvasKit 좌표 로그인은 Tab 무좌표
방식으로 확정·검증, `flutter devices`에 모바일/에뮬레이터 없음 확인).
관리자 로그인 이후 화면은 해소: 로컬 Go+임시 sqlite+role 승격 경유 대시보드
KO/EN 2장(`screenshots/admin/`, 에러 0건).

## 3. 전수 검사 결과표

| 분류 | 항목 | 결과 | 증거 |
| --- | --- | --- | --- |
| 기능 | Go 전체 스위트(parity 5종+지갑 0원 포함) | 통과 | `go test ./...` 그린 |
| 기능 | 엣지 스위트(라우터 분리 경로 교정 포함) | 통과 75/75 | `node --test` |
| 기능 | Flutter 분석+테스트(푸시토큰 정합 포함) | 통과 16/16 | analyze clean |
| 기능 | 프리 게이트 6/6 | 통과 | pre_deploy_gate |
| 기능 | 6 워크스페이스 빌드 | 통과 | build_cf (스크린샷 dist) |
| 기능 | 앱 E2E 캡처 21샷(실 UI 로그인) | 통과 21/21 | capture_app.mjs + manifest |
| 권한 | 비인증 401·타인 세션 404·비멤버 404·403 | 통과 | parity 테스트 내 부정 케이스 10건 |
| 상태 | 빈/로딩/에러 | 부분 | Keep/북마크/번역 실패 처리 확인, 전 화면 매트릭스는 잔여 |
| 반응형 | 웹 49샷+앱 21샷 | 통과 | manifest + 육안 11장 |
| 입력 | 비밀번호 12자·UUID·페이로드 검증 | 통과 | 서버+클라이언트 이중 검증 |
| 성능 | LCP 측정(랩·무스로틀) | 통과 | PC 784ms·모바일 520ms(목표 2500ms), 전송 약 1.2MB |
| 접근성 | 대비 AA(텍스트·상태색)·44px·포커스·모션 | 통과(신규분) | 토큰 테스트 + 컴포넌트 내장 |
| 보안 | JWT·세션 무효화·CORS·헤더·레이트리밋 | 통과 | 코드+테스트 |
| 관리자 | 콘솔 25화면 배선 | 통과 | 감사+빌드+로그인 이후 대시보드 KO/EN 2샷(에러 0건) |

## 4. 상용화 기능 갭 분석표

| ID | 기능 | 상태 | 우선순위 | 비고 |
| --- | --- | --- | --- | --- |
| G1-01~12 | P0 불일치 12건(비번·북마크·내보내기·탈퇴·세션·친구·메타·전체읽음·나가기·푸시·메뉴·봇룰) | 구현됨 | P0 | 서버 10라우트+클라이언트 교정, 테스트 그린 |
| G1-13 | 번역 API | 미구현 | P1 | 엔진 계약 필요(§5). 앱은 에러 처리됨 |
| G1-14 | 대화방 리치메뉴 조회 | 미구현 | P1 | 대화→OA 매핑 스키마 필요. 클라이언트는 null 정상 처리 |
| G1-15 | 전화 로그인 | 봉인됨 | P1 | SMS 계약 필요. 진입 차단+안내문 적용 |
| G1-16 | 충전/PG | 봉인됨 | 계약 | PG 계약 전까지 503 유지(의도) |
| G1-17 | 푸시토큰 페이로드 불일치(앱 400) | 구현됨 | P0 | device_id 저장+정규 페이로드로 교정, 양 백엔드 호환 확인 |
| G1-18 | 신규 지갑 팬텀 시드(Go 125000·워커 50000·D1 100000) | 구현됨 | P0 | 3곳 모두 0원 시드로 교정, 원장 무결성(빈 내역=0원) |
| G2 | vue-router+URL 분리+App.vue 분할 | 구현됨 | P0 | 셸+AuthView+MessengerView+session 스토어, 빌드·49샷 그린 |
| G3 | i18n 전수 전환(보정 693→0줄) | 구현됨 | P1 | AuthView·MessengerView(462→0, 신규키 441·4로케일)·콘솔 5종 0건, 스캐너 TOTAL 0, KO/EN 실데이터 회귀 |
| G4 | 검색 자동완성 | 미구현 | P1 | 스펙 §6, LIKE 검색은 동작 중 |
| G5 | SEO 최소(OG·canonical) | 구현됨 | P1 | OG PNG+canonical+절대경로, 사이트맵/robots 잔여 |
| G6 | E2EE 실배선·소셜로그인·MFA | 미구현 | P2/계약 | 키 테이블만 존재 |
| G7 | 모니터링·E2E 스위트 | 구현됨 | P1 | 벤더 없이 로컬 링버퍼(웹+앱 배선), Go 실백엔드 여정 스위트(Go 없으면 skip) |

## 5. 엔진 비교표 (비교·추정치까지만, 계약 금지)

| 영역 | 후보 A | 후보 B | 후보 C | 추천 |
| --- | --- | --- | --- | --- |
| 검색 | PG FTS(무료·내장, 한국어 기본) | Meilisearch(무료·오픈소스, 쉬움) | Typesense(무료·오픈소스, 빠름) | 1단계 PG FTS, 2단계 Meilisearch |
| 번역 | Google Cloud Translation(유료·정확) | DeepL API(유료·자연스러움) | LibreTranslate(무료·자가호스팅) | 품의 후 DeepL, 과도기 LibreTranslate |
| PG | 토스페이먼츠(국내 간편) | Stripe(글로벌) | PortOne(통합) | 국내 토스+글로벌 Stripe |
| SMS | NCP SENS(국내) | Solapi(국내 저렴) | Twilio(글로벌) | 국내 NCP/Solapi |
| 푸시 | FCM(필수) | APNs(필수) | — | 둘 다(큐·토큰 테이블 준비됨) |
| 모니터링 | Sentry(에러) | Grafana+OTel(지표) | Better Stack(상태) | Sentry+Grafana |

월 비용은 트래픽 연동 전 추정치 불가 항목으로 표기. 심사: PG 1~2주(사업자·정산계좌),
SMS 발신번호 등록 수일, 스토어 개발자 계정(Play $25 1회·Apple $99/년).

## 6. 검색과 자동완성 스펙

- 현재: `GET /api/v1/search`(LIKE, 2~100자) + 대화내 검색 동작 중.
- 목표 API: `GET /api/v1/search/suggest?q=&limit=` → `{suggest:[{text, kind}]}`.
  1단계 PG prefix LIKE로 구현, 응답 OpenAPI 문서화 후 2단계 Meilisearch 교체.
- UI: 디바운스 250ms·초성·최근검색어(localStorage)·인기검색어(서버)·방향키/Enter/ESC·
  빈결과·하이라이트. Vue `SearchAutocomplete.vue` + Flutter 동등 위젯(신규 위젯
  라이브러리 위에 구현).
- 남은 작업: suggest API+UI+OpenAPI(P1, 약 3~5일).

## 7. 다국어 현황표

| 항목 | ko | en | th | ja |
| --- | --- | --- | --- | --- |
| UI 사전 키 수 | 536 | 532 | 532 | 538 |
| 원시 키 누출 | 0 | 0(9건 해소) | 0(9건 해소) | 0(9건 해소) |
| 브랜드명 | LUNO 통일 | LUNO | LUNO | LUNO |

- 구조: 자작 사전+handoff(ko/en)+UI 사전(4개). vue-i18n 미도입(전환은 P2).
- 누락: 하드코딩 인벤토리 TOTAL 0(스캐너 기계 판정). 날짜·상대시간·통화(KRW)
  Intl 전면 적용. URL 로케일(/ko/)·hreflang은 잔여.
- 번역 엔진: 5문장 코퍼스+키워드(현행). 실번역은 §5 계약 항목.

## 8. 보안·성능·SEO·접근성 점검표

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 보안 헤더 6종 | ✓ | core.go cors + 실배포 |
| JWT+세션 무효화·역할 게이트 | ✓ | withAuth/requireRoles + revoke 테스트 |
| 레이트리밋·CORS allowlist | ✓ | 인메모리 60req/min(분산은 P2 Redis) |
| SQL 인젝션·XSS | ✓ 구조 | 플레이스홀더 전용, Vue 이스케이프(감사 샘플 기준) |
| 토큰 보관 | △ | localStorage(인지된 한계, httpOnly 전환 P1) |
| 번들 | 기록 | 첫 페인트 JS 263KB(gzip 89KB)+Messenger 청크 149KB, 사전 4로케일 포함 |
| LCP(랩·무스로틀) | ✓ | PC 984ms·모바일 608ms 중앙값(목표 2500ms), 전송 1.18MB. 콜드런 스파이크 관측됨 |
| SEO 최소 | ✓ | OG PNG+canonical+절대경로. 사이트맵/robots P1 잔여 |
| 대비 AA·44px·포커스·모션배려 | ✓ 신규분 | 토큰 테스트 + 컴포넌트 내장 |

## 9. 상용화 로드맵

| 단계 | 작업 | 담당 | 예상 |
| --- | --- | --- | --- |
| P0-1 | vue-router 도입+화면 분할+URL 매핑 | Vue | 완료(기계 분할+빌드+49샷 검증) |
| P0-2 | 관리자 로그인 이후 샷+전 화면 상태 매트릭스 | QA | 샷 완료(admin 2장), 상태 매트릭스 잔여 |
| P1-1 | i18n 전수 전환+handoff 정리 | Vue | 완료(693→0줄, KO/EN 실데이터 회귀) |
| P1-2 | suggest API+UI+OpenAPI | Go+Vue+Flutter | 1주 |
| P1-3 | 스플리팅+SEO 최소(LCP 측정 완료) | Vue | 완료(첫 페인트 263KB, OG/canonical) |
| P1-4 | 번역/전화/리치메뉴 잔여 | Go+계약 | 계약 후 1주 |
| P2 | E2EE·소셜·MFA·분산 리밋·PG 실연동 | 전담 | 별도 산정 |

## 10. 상용화 단계 계약·결제 목록 (지금은 비교까지만)

| # | 항목 | 비교 대상 | 필요 서류·심사 | 비고 |
| --- | --- | --- | --- | --- |
| 1 | 클라우드·DB·CDN | Cloudflare(현행)/AWS/GCP | 카드, 즉시 | 현행 유지 가능 |
| 2 | PG·정산 | 토스/Stripe/PortOne | 사업자·정산계좌, 1~2주 | 충전 봉인 해제 조건 |
| 3 | SMS·이메일 | NCP SENS/Solapi/Twilio·SES | 발신번호 등록 수일 | 전화 로그인 조건 |
| 4 | 검색 클라우드 | Meilisearch Cloud/Typesense Cloud | 카드, 즉시 | 2단계(1단계 무료 자가) |
| 5 | 번역 API | DeepL/Google | 카드·품의, 즉시 | 실번역 조건 |
| 6 | 모니터링·로그 | Sentry/Grafana Cloud | 카드, 즉시 | 무료 티어 가능 |
| 7 | 도메인·SSL | 가비아/Cloudflare Registrar | 즉시 | 기존 보유분 유지 |
| 8 | 스토어 계정 | Play 1회 $25/Apple $99·년 | D-U-N-S(Apple), 수일~2주 | 앱 배포 조건 |
| 9 | 약관·개인정보 검토 | 법무법인 자문 | 견적·2~4주 | 상용 전 필수 |

## 11. 가정 목록

- A1~A5: Phase 0 문서(프로젝트=LUNO, stdlib 유지, 계약 금지, 토큰 승계, 샷 범위).
- B1: 북마크는 서버 별칭 대신 앱을 saved-messages로 교정(단일 진실원천).
- B2: 탈퇴는 비밀번호 확인 유지(서버 정책), 클라이언트에 입력칸 추가.
- B3: 데모 로그인은 워커 전용 유지, Go 직결 시 칩 숨김.
- B4: 전화·번역·충전은 봉인/에러 유지, 계약 후 구현.
- B5: 대화방 리치메뉴는 스키마 매핑 부재로 P1 연기(null 정상 처리).
- B6: 즐겨찾기·고정은 신규 컬럼(001+006), 음소거는 muted_until, 차단은 blocks 유지.
- B7: 라우터 분리는 점진 전환(빅뱅 금지). i18n은 자작 사전 유지.
- B8: 푸시토큰은 서버 계약(device_id+provider+token)을 정본으로 앱을 교정.
  워커 정합성도 동시 확인(추가 provider 키 무시·201).
- B9: 신규 지갑 0원 시드. 데모 고정계정 잔액(schema/fix 시드)은 데모 픽스처로 유지.
- B10: 앱 캡처 로그인은 Tab 무좌표 방식(CanvasKit 좌표 추정의 취약성 제거).
- B11: LCP는 무스로틀 랩 수치(합격선 여유 3배). 필드 데이터·저사양 기기는 P1-3 후속.

## 12. 최종 완료 기준 체크

| 기준 (§14) | 판정 | 근거·잔여 |
| --- | --- | --- |
| 전 페이지 새 디자인 통일 | 부분 | 토큰+베이스 완성, 전 화면 교체는 P1-1과 병행 |
| 독립 URL 분리 | ✓ | 셸+AuthView+MessengerView, 딥링크 SPA 폴백 실측 |
| 4환경 무스크롤+샷 증명 | 부분 | 웹 49샷+앱 21샷(웹빌드) ✓, 앱 실기기 샷 미실시 |
| 전수표 통과·실패 명시 | ✓ | §3 표, 잔여는 §4로 연결 |
| 보고서 12목차 포함 | ✓ | 본 문서 |
| 독창적 디자인 | ✓ | Harbor 유지, 슬롭 금지 준수 |
| 계약은 상용 단계로 명시 | ✓ | §10, 실제 계약 0건 |

— 끝 —
