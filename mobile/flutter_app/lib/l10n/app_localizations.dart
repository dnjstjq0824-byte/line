import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ja.dart';
import 'app_localizations_ko.dart';
import 'app_localizations_th.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ja'),
    Locale('ko'),
    Locale('th')
  ];

  /// mvLogout (F20)
  ///
  /// In ko, this message translates to:
  /// **'로그아웃'**
  String get mvLogout;

  /// mvHome (F20)
  ///
  /// In ko, this message translates to:
  /// **'홈'**
  String get mvHome;

  /// mvNews (F20)
  ///
  /// In ko, this message translates to:
  /// **'뉴스'**
  String get mvNews;

  /// mvCall (F20)
  ///
  /// In ko, this message translates to:
  /// **'통화'**
  String get mvCall;

  /// mvWallet (F20)
  ///
  /// In ko, this message translates to:
  /// **'지갑'**
  String get mvWallet;

  /// mvRailShop (F20)
  ///
  /// In ko, this message translates to:
  /// **'쇼핑'**
  String get mvRailShop;

  /// verifyTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'이메일 인증'**
  String get verifyTitle;

  /// verifyCodeLabel (F20)
  ///
  /// In ko, this message translates to:
  /// **'인증번호'**
  String get verifyCodeLabel;

  /// verifySubmit (F20)
  ///
  /// In ko, this message translates to:
  /// **'인증하기'**
  String get verifySubmit;

  /// verifyResend (F20)
  ///
  /// In ko, this message translates to:
  /// **'인증번호 다시 받기'**
  String get verifyResend;

  /// createAccount (F20)
  ///
  /// In ko, this message translates to:
  /// **'회원가입'**
  String get createAccount;

  /// signInBtn (F20)
  ///
  /// In ko, this message translates to:
  /// **'로그인'**
  String get signInBtn;

  /// verifyEmailLabel (F20)
  ///
  /// In ko, this message translates to:
  /// **'이메일'**
  String get verifyEmailLabel;

  /// callVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'영상통화'**
  String get callVideo;

  /// callVoice (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성통화'**
  String get callVoice;

  /// navChats (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화'**
  String get navChats;

  /// mvCalling (F20)
  ///
  /// In ko, this message translates to:
  /// **'발신 중...'**
  String get mvCalling;

  /// apprReject (F20)
  ///
  /// In ko, this message translates to:
  /// **'거절'**
  String get apprReject;

  /// mvCameraToggle (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라 켜기/끄기'**
  String get mvCameraToggle;

  /// mvCameraSwitch (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라 전환'**
  String get mvCameraSwitch;

  /// officialChannels (F20)
  ///
  /// In ko, this message translates to:
  /// **'공식 채널'**
  String get officialChannels;

  /// mvSticker (F20)
  ///
  /// In ko, this message translates to:
  /// **'스티커'**
  String get mvSticker;

  /// camPhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'사진'**
  String get camPhoto;

  /// camVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'동영상'**
  String get camVideo;

  /// gsJoinByLink (F20)
  ///
  /// In ko, this message translates to:
  /// **'링크로 참여'**
  String get gsJoinByLink;

  /// mvCancel (F20)
  ///
  /// In ko, this message translates to:
  /// **'취소'**
  String get mvCancel;

  /// gsJoin (F20)
  ///
  /// In ko, this message translates to:
  /// **'참여하기'**
  String get gsJoin;

  /// mvGroupName (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 이름'**
  String get mvGroupName;

  /// mvChatFallback (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방'**
  String get mvChatFallback;

  /// gsNotice (F20)
  ///
  /// In ko, this message translates to:
  /// **'공지'**
  String get gsNotice;

  /// mvSave (F20)
  ///
  /// In ko, this message translates to:
  /// **'저장'**
  String get mvSave;

  /// mvSubmit (F20)
  ///
  /// In ko, this message translates to:
  /// **'등록'**
  String get mvSubmit;

  /// mvSend (F20)
  ///
  /// In ko, this message translates to:
  /// **'송금'**
  String get mvSend;

  /// apprTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'승인함'**
  String get apprTitle;

  /// gsTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 설정'**
  String get gsTitle;

  /// mvLocationShare (F20)
  ///
  /// In ko, this message translates to:
  /// **'위치 공유'**
  String get mvLocationShare;

  /// msgKindProposal (F20)
  ///
  /// In ko, this message translates to:
  /// **'제안'**
  String get msgKindProposal;

  /// msgKindDecision (F20)
  ///
  /// In ko, this message translates to:
  /// **'결정'**
  String get msgKindDecision;

  /// msgKindReport (F20)
  ///
  /// In ko, this message translates to:
  /// **'보고'**
  String get msgKindReport;

  /// mvApprove (F20)
  ///
  /// In ko, this message translates to:
  /// **'승인'**
  String get mvApprove;

  /// apprApprovedState (F20)
  ///
  /// In ko, this message translates to:
  /// **'승인됨'**
  String get apprApprovedState;

  /// apprRejectedState (F20)
  ///
  /// In ko, this message translates to:
  /// **'거절됨'**
  String get apprRejectedState;

  /// translating (F20)
  ///
  /// In ko, this message translates to:
  /// **'AI 번역 중...'**
  String get translating;

  /// mvRecoverReset (F20)
  ///
  /// In ko, this message translates to:
  /// **'비밀번호 변경'**
  String get mvRecoverReset;

  /// mvForwardTo (F20)
  ///
  /// In ko, this message translates to:
  /// **'전달할 방 선택'**
  String get mvForwardTo;

  /// mvShareContact (F20)
  ///
  /// In ko, this message translates to:
  /// **'연락처 공유'**
  String get mvShareContact;

  /// apprEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'대기 중인 제안이 없습니다'**
  String get apprEmpty;

  /// mvPwCurrent (F20)
  ///
  /// In ko, this message translates to:
  /// **'현재 비밀번호'**
  String get mvPwCurrent;

  /// mvMoreActions (F20)
  ///
  /// In ko, this message translates to:
  /// **'더보기'**
  String get mvMoreActions;

  /// sendBtn (F20)
  ///
  /// In ko, this message translates to:
  /// **'전송'**
  String get sendBtn;

  /// mvGroupCallWaiting (F20)
  ///
  /// In ko, this message translates to:
  /// **'다른 참가자를 기다리는 중...'**
  String get mvGroupCallWaiting;

  /// mvMe (F20)
  ///
  /// In ko, this message translates to:
  /// **'나'**
  String get mvMe;

  /// gsOwner (F20)
  ///
  /// In ko, this message translates to:
  /// **'방장'**
  String get gsOwner;

  /// demoAdmin (F20)
  ///
  /// In ko, this message translates to:
  /// **'관리자'**
  String get demoAdmin;

  /// gsMembers (F20)
  ///
  /// In ko, this message translates to:
  /// **'멤버'**
  String get gsMembers;

  /// gsPhotoChange (F20)
  ///
  /// In ko, this message translates to:
  /// **'사진 변경'**
  String get gsPhotoChange;

  /// gsPhotoRemove (F20)
  ///
  /// In ko, this message translates to:
  /// **'사진 삭제'**
  String get gsPhotoRemove;

  /// gsName (F20)
  ///
  /// In ko, this message translates to:
  /// **'방 이름'**
  String get gsName;

  /// gsInvite (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구 초대'**
  String get gsInvite;

  /// gsInviteNone (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대할 친구가 없습니다.'**
  String get gsInviteNone;

  /// gsLinks (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크'**
  String get gsLinks;

  /// gsLeaveConfirm (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹에서 나갈까요?'**
  String get gsLeaveConfirm;

  /// gsTransferConfirm (F20)
  ///
  /// In ko, this message translates to:
  /// **'방장을 넘기면 설정 권한을 잃습니다. 계속할까요?'**
  String get gsTransferConfirm;

  /// gsKickConfirm (F20)
  ///
  /// In ko, this message translates to:
  /// **'정말 내보낼까요?'**
  String get gsKickConfirm;

  /// gsRemoveAdmin (F20)
  ///
  /// In ko, this message translates to:
  /// **'관리자 해제'**
  String get gsRemoveAdmin;

  /// gsMakeAdmin (F20)
  ///
  /// In ko, this message translates to:
  /// **'관리자로 지정'**
  String get gsMakeAdmin;

  /// gsTransfer (F20)
  ///
  /// In ko, this message translates to:
  /// **'방장 넘기기'**
  String get gsTransfer;

  /// gsKick (F20)
  ///
  /// In ko, this message translates to:
  /// **'내보내기'**
  String get gsKick;

  /// gsLinkCopy (F20)
  ///
  /// In ko, this message translates to:
  /// **'복사'**
  String get gsLinkCopy;

  /// gsLinkCopied (F20)
  ///
  /// In ko, this message translates to:
  /// **'복사했습니다.'**
  String get gsLinkCopied;

  /// gsLinkRevoke (F20)
  ///
  /// In ko, this message translates to:
  /// **'폐기'**
  String get gsLinkRevoke;

  /// mvSearch (F20)
  ///
  /// In ko, this message translates to:
  /// **'검색'**
  String get mvSearch;

  /// mvOfficialAccount (F20)
  ///
  /// In ko, this message translates to:
  /// **'공식 계정'**
  String get mvOfficialAccount;

  /// birthdayFriends (F20)
  ///
  /// In ko, this message translates to:
  /// **'오늘 생일인 친구'**
  String get birthdayFriends;

  /// mvFavTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'즐겨찾기'**
  String get mvFavTitle;

  /// mvUnblock (F20)
  ///
  /// In ko, this message translates to:
  /// **'차단 해제'**
  String get mvUnblock;

  /// mvReportUser (F20)
  ///
  /// In ko, this message translates to:
  /// **'신고하기'**
  String get mvReportUser;

  /// reloadBtn (F20)
  ///
  /// In ko, this message translates to:
  /// **'새로고침'**
  String get reloadBtn;

  /// reportCatSpam (F20)
  ///
  /// In ko, this message translates to:
  /// **'스팸'**
  String get reportCatSpam;

  /// reportCatAbuse (F20)
  ///
  /// In ko, this message translates to:
  /// **'욕설·비방'**
  String get reportCatAbuse;

  /// reportCatHarassment (F20)
  ///
  /// In ko, this message translates to:
  /// **'괴롭힘'**
  String get reportCatHarassment;

  /// reportCatIllegalFilming (F29)
  ///
  /// In ko, this message translates to:
  /// **'불법촬영물'**
  String get reportCatIllegalFilming;

  /// reportCatChildExploitation (F29)
  ///
  /// In ko, this message translates to:
  /// **'아동 성착취물'**
  String get reportCatChildExploitation;

  /// reportCatViolence (F29)
  ///
  /// In ko, this message translates to:
  /// **'폭력'**
  String get reportCatViolence;

  /// contactFindTitle (F26)
  ///
  /// In ko, this message translates to:
  /// **'연락처로 찾기'**
  String get contactFindTitle;

  /// contactConsentTitle (F26)
  ///
  /// In ko, this message translates to:
  /// **'연락처 찾기 동의'**
  String get contactConsentTitle;

  /// contactConsentBody (F26)
  ///
  /// In ko, this message translates to:
  /// **'주소록의 전화번호를 LUNO 서버와 대조해 친구를 찾습니다. 번호는 저장되지 않습니다.'**
  String get contactConsentBody;

  /// contactConsentAgree (F26)
  ///
  /// In ko, this message translates to:
  /// **'동의하고 계속하기'**
  String get contactConsentAgree;

  /// contactConsentLater (F26)
  ///
  /// In ko, this message translates to:
  /// **'나중에'**
  String get contactConsentLater;

  /// contactLoad (F26)
  ///
  /// In ko, this message translates to:
  /// **'연락처 불러오기'**
  String get contactLoad;

  /// contactFindHint (F26)
  ///
  /// In ko, this message translates to:
  /// **'버튼을 눌러 주소록에서 친구를 찾아보세요.'**
  String get contactFindHint;

  /// contactFindEmpty (F26)
  ///
  /// In ko, this message translates to:
  /// **'일치하는 친구를 찾지 못했습니다.'**
  String get contactFindEmpty;

  /// contactUnavailable (F26)
  ///
  /// In ko, this message translates to:
  /// **'연락처 찾기를 사용할 수 없습니다.'**
  String get contactUnavailable;

  /// contactPermTitle (F26)
  ///
  /// In ko, this message translates to:
  /// **'연락처 권한'**
  String get contactPermTitle;

  /// contactPermDesc (F26)
  ///
  /// In ko, this message translates to:
  /// **'주소록에서 친구를 찾으려면 연락처 권한이 필요합니다.'**
  String get contactPermDesc;

  /// mvDeleteReasonOther (F20)
  ///
  /// In ko, this message translates to:
  /// **'기타'**
  String get mvDeleteReasonOther;

  /// reportCategory (F20)
  ///
  /// In ko, this message translates to:
  /// **'사유'**
  String get reportCategory;

  /// reportSubmit (F20)
  ///
  /// In ko, this message translates to:
  /// **'신고 접수'**
  String get reportSubmit;

  /// gsLeave (F20)
  ///
  /// In ko, this message translates to:
  /// **'나가기'**
  String get gsLeave;

  /// mvReactLike (F20)
  ///
  /// In ko, this message translates to:
  /// **'좋아요'**
  String get mvReactLike;

  /// mvNewsSampleBanner (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 에디토리얼 샘플 콘텐츠입니다. 실제 언론 기사가 아닙니다.'**
  String get mvNewsSampleBanner;

  /// mvTodayPopular (F20)
  ///
  /// In ko, this message translates to:
  /// **'오늘의 인기 기사'**
  String get mvTodayPopular;

  /// mvRecoverCancel (F20)
  ///
  /// In ko, this message translates to:
  /// **'닫기'**
  String get mvRecoverCancel;

  /// reportStateResolved (F20)
  ///
  /// In ko, this message translates to:
  /// **'처리 완료'**
  String get reportStateResolved;

  /// reportStateDismissed (F20)
  ///
  /// In ko, this message translates to:
  /// **'각하됨'**
  String get reportStateDismissed;

  /// reportStateOpen (F20)
  ///
  /// In ko, this message translates to:
  /// **'처리 중'**
  String get reportStateOpen;

  /// reportHistoryTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 신고 내역'**
  String get reportHistoryTitle;

  /// reportHistoryEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'접수한 신고가 없습니다.'**
  String get reportHistoryEmpty;

  /// supportTitle (F30)
  ///
  /// In ko, this message translates to:
  /// **'문의하기'**
  String get supportTitle;

  /// supportCategory (F30)
  ///
  /// In ko, this message translates to:
  /// **'분류'**
  String get supportCategory;

  /// supportBodyPh (F30)
  ///
  /// In ko, this message translates to:
  /// **'문의 내용을 입력해 주세요'**
  String get supportBodyPh;

  /// supportSubmit (F30)
  ///
  /// In ko, this message translates to:
  /// **'문의 접수'**
  String get supportSubmit;

  /// supportDoneNote (F30)
  ///
  /// In ko, this message translates to:
  /// **'문의가 접수되었습니다.'**
  String get supportDoneNote;

  /// supportHistoryTitle (F30)
  ///
  /// In ko, this message translates to:
  /// **'내 문의 내역'**
  String get supportHistoryTitle;

  /// supportHistoryEmpty (F30)
  ///
  /// In ko, this message translates to:
  /// **'접수한 문의가 없습니다.'**
  String get supportHistoryEmpty;

  /// supportStateOpen (F30)
  ///
  /// In ko, this message translates to:
  /// **'처리 중'**
  String get supportStateOpen;

  /// supportStateAnswered (F30)
  ///
  /// In ko, this message translates to:
  /// **'답변 완료'**
  String get supportStateAnswered;

  /// supportCatAccount (F30)
  ///
  /// In ko, this message translates to:
  /// **'계정'**
  String get supportCatAccount;

  /// supportCatChat (F30)
  ///
  /// In ko, this message translates to:
  /// **'대화'**
  String get supportCatChat;

  /// supportCatPayment (F30)
  ///
  /// In ko, this message translates to:
  /// **'결제'**
  String get supportCatPayment;

  /// supportCatBug (F30)
  ///
  /// In ko, this message translates to:
  /// **'오류 신고'**
  String get supportCatBug;

  /// supportCatOther (F30)
  ///
  /// In ko, this message translates to:
  /// **'기타'**
  String get supportCatOther;

  /// settingsSupportDesc (F30)
  ///
  /// In ko, this message translates to:
  /// **'문의 접수와 답변 확인'**
  String get settingsSupportDesc;

  /// mvRecentSearch (F20)
  ///
  /// In ko, this message translates to:
  /// **'최근 검색어'**
  String get mvRecentSearch;

  /// navFriends (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구'**
  String get navFriends;

  /// mvAdd (F20)
  ///
  /// In ko, this message translates to:
  /// **'추가'**
  String get mvAdd;

  /// mvDeleteConfirmAria (F20)
  ///
  /// In ko, this message translates to:
  /// **'확인 이메일 입력'**
  String get mvDeleteConfirmAria;

  /// mvDeleteReasonNotUsing (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용하지 않음'**
  String get mvDeleteReasonNotUsing;

  /// mvDeleteReasonPrivacy (F20)
  ///
  /// In ko, this message translates to:
  /// **'개인정보 우려'**
  String get mvDeleteReasonPrivacy;

  /// mvDeleteReasonHardToUse (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용하기 어려움'**
  String get mvDeleteReasonHardToUse;

  /// shopEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'등록된 상품이 없습니다'**
  String get shopEmpty;

  /// mvPaymentsPreparing (F20)
  ///
  /// In ko, this message translates to:
  /// **'결제 기능은 준비 중입니다.'**
  String get mvPaymentsPreparing;

  /// verifyResentNote (F20)
  ///
  /// In ko, this message translates to:
  /// **'인증번호를 다시 보냈습니다.'**
  String get verifyResentNote;

  /// verifyNeededNote (F20)
  ///
  /// In ko, this message translates to:
  /// **'이메일 인증이 필요합니다.'**
  String get verifyNeededNote;

  /// accountRecoveredNote (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정이 복구되었습니다.'**
  String get accountRecoveredNote;

  /// mvCallBusy (F20)
  ///
  /// In ko, this message translates to:
  /// **'다른 통화 중입니다 (자동 거절)'**
  String get mvCallBusy;

  /// mvGroupCallFull (F20)
  ///
  /// In ko, this message translates to:
  /// **'통화 인원이 가득 찼습니다 (최대 8명)'**
  String get mvGroupCallFull;

  /// mvGroupCallFailed (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 통화에 참가하지 못했습니다'**
  String get mvGroupCallFailed;

  /// mvIncomingVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'영상 전화가 왔습니다'**
  String get mvIncomingVideo;

  /// mvIncomingVoice (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성 전화가 왔습니다'**
  String get mvIncomingVoice;

  /// reportDoneNote (F20)
  ///
  /// In ko, this message translates to:
  /// **'신고가 접수되었습니다.'**
  String get reportDoneNote;

  /// gsInviteDone (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대했습니다.'**
  String get gsInviteDone;

  /// mvHideDone (F20)
  ///
  /// In ko, this message translates to:
  /// **'나에게서 삭제했습니다.'**
  String get mvHideDone;

  /// mvForwarded (F20)
  ///
  /// In ko, this message translates to:
  /// **'전달했습니다.'**
  String get mvForwarded;

  /// mvJustNow (F20)
  ///
  /// In ko, this message translates to:
  /// **'방금 전'**
  String get mvJustNow;

  /// mvMissedCall (F20)
  ///
  /// In ko, this message translates to:
  /// **'부재중 전화'**
  String get mvMissedCall;

  /// mvToday (F20)
  ///
  /// In ko, this message translates to:
  /// **'오늘'**
  String get mvToday;

  /// mvYesterday (F20)
  ///
  /// In ko, this message translates to:
  /// **'어제'**
  String get mvYesterday;

  /// fxGray (F20)
  ///
  /// In ko, this message translates to:
  /// **'흑백'**
  String get fxGray;

  /// fxSepia (F20)
  ///
  /// In ko, this message translates to:
  /// **'세피아'**
  String get fxSepia;

  /// fxOriginal (F20)
  ///
  /// In ko, this message translates to:
  /// **'원본'**
  String get fxOriginal;

  /// shopFree (F20)
  ///
  /// In ko, this message translates to:
  /// **'무료'**
  String get shopFree;

  /// shopOwned (F20)
  ///
  /// In ko, this message translates to:
  /// **'보유 중'**
  String get shopOwned;

  /// apiNetworkError (F20)
  ///
  /// In ko, this message translates to:
  /// **'네트워크 연결 오류: {error}'**
  String apiNetworkError(String error);

  /// apiBadResponse (F20)
  ///
  /// In ko, this message translates to:
  /// **'유효하지 않은 응답 형식'**
  String get apiBadResponse;

  /// apiHttpError (F20)
  ///
  /// In ko, this message translates to:
  /// **'HTTP 오류: {code}'**
  String apiHttpError(int code);

  /// harborDesk (F20)
  ///
  /// In ko, this message translates to:
  /// **'하버 데스크'**
  String get harborDesk;

  /// appWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'앱'**
  String get appWord;

  /// offlineRetryNotice (F20)
  ///
  /// In ko, this message translates to:
  /// **'오프라인 상태입니다. 연결 후 다시 시도해주세요.'**
  String get offlineRetryNotice;

  /// retryWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'재시도'**
  String get retryWord;

  /// resendWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'재전송'**
  String get resendWord;

  /// closeWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'종료'**
  String get closeWord;

  /// Bottom tab / rail label for the chat list
  ///
  /// In ko, this message translates to:
  /// **'채팅'**
  String get tabChats;

  /// No description provided for @actTranslate.
  ///
  /// In ko, this message translates to:
  /// **'번역'**
  String get actTranslate;

  /// No description provided for @actPin.
  ///
  /// In ko, this message translates to:
  /// **'공지로 등록'**
  String get actPin;

  /// No description provided for @actKeep.
  ///
  /// In ko, this message translates to:
  /// **'Keep에 저장'**
  String get actKeep;

  /// No description provided for @actUnsend.
  ///
  /// In ko, this message translates to:
  /// **'보내기 취소'**
  String get actUnsend;

  /// No description provided for @actForward.
  ///
  /// In ko, this message translates to:
  /// **'전달'**
  String get actForward;

  /// No description provided for @actHide.
  ///
  /// In ko, this message translates to:
  /// **'나에게서 삭제'**
  String get actHide;

  /// navTalks (F20)
  ///
  /// In ko, this message translates to:
  /// **'토크'**
  String get navTalks;

  /// navFeed (F20)
  ///
  /// In ko, this message translates to:
  /// **'피드'**
  String get navFeed;

  /// navLounge (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지'**
  String get navLounge;

  /// settingsTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'설정'**
  String get settingsTitle;

  /// consoleTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'콘솔'**
  String get consoleTitle;

  /// appsAllServices (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 서비스 전체 목록'**
  String get appsAllServices;

  /// authFastChat (F20)
  ///
  /// In ko, this message translates to:
  /// **'빠르고 가벼운 대화'**
  String get authFastChat;

  /// authRealtimeSync (F20)
  ///
  /// In ko, this message translates to:
  /// **'실시간 동기화'**
  String get authRealtimeSync;

  /// authGroups (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 채팅과 모임'**
  String get authGroups;

  /// authPollsEtc (F20)
  ///
  /// In ko, this message translates to:
  /// **'투표·일정·앨범'**
  String get authPollsEtc;

  /// authPaySend (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO Pay 송금'**
  String get authPaySend;

  /// authRightInRoom (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방에서 바로'**
  String get authRightInRoom;

  /// authHarborGate (F20)
  ///
  /// In ko, this message translates to:
  /// **'하버 게이트 v3'**
  String get authHarborGate;

  /// authDisplayName (F20)
  ///
  /// In ko, this message translates to:
  /// **'표시 이름'**
  String get authDisplayName;

  /// authPasswordHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'비밀번호 (12자 이상 권장)'**
  String get authPasswordHint;

  /// authSignUp (F20)
  ///
  /// In ko, this message translates to:
  /// **'가입'**
  String get authSignUp;

  /// authLoginExisting (F20)
  ///
  /// In ko, this message translates to:
  /// **'기존 계정으로 로그인'**
  String get authLoginExisting;

  /// authCreateNew (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 LUNO 계정 만들기'**
  String get authCreateNew;

  /// No description provided for @consentTerms.
  ///
  /// In ko, this message translates to:
  /// **'이용약관에 동의합니다 (필수)'**
  String get consentTerms;

  /// No description provided for @consentPrivacy.
  ///
  /// In ko, this message translates to:
  /// **'개인정보 처리방침에 동의합니다 (필수)'**
  String get consentPrivacy;

  /// No description provided for @consentViewTerms.
  ///
  /// In ko, this message translates to:
  /// **'약관 보기'**
  String get consentViewTerms;

  /// No description provided for @consentViewPrivacy.
  ///
  /// In ko, this message translates to:
  /// **'방침 보기'**
  String get consentViewPrivacy;

  /// No description provided for @birthdateLabel.
  ///
  /// In ko, this message translates to:
  /// **'생년월일 (YYYY-MM-DD)'**
  String get birthdateLabel;

  /// No description provided for @birthdateRequiredErr.
  ///
  /// In ko, this message translates to:
  /// **'생년월일을 입력해 주세요.'**
  String get birthdateRequiredErr;

  /// No description provided for @underageErr.
  ///
  /// In ko, this message translates to:
  /// **'만 14세 이상만 가입할 수 있습니다.'**
  String get underageErr;

  /// No description provided for @consentRequiredErr.
  ///
  /// In ko, this message translates to:
  /// **'이용약관과 개인정보 처리방침에 모두 동의해 주세요.'**
  String get consentRequiredErr;

  /// No description provided for @consentStaleTitle.
  ///
  /// In ko, this message translates to:
  /// **'약관이 변경되었습니다'**
  String get consentStaleTitle;

  /// No description provided for @consentStaleNote.
  ///
  /// In ko, this message translates to:
  /// **'변경된 약관에 다시 동의해야 로그인할 수 있습니다.'**
  String get consentStaleNote;

  /// callsEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'통화 기록이 없습니다'**
  String get callsEmpty;

  /// callsStartHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방에서 음성 또는 영상 통화를 시작해 보세요'**
  String get callsStartHint;

  /// unknownWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'알 수 없음'**
  String get unknownWord;

  /// permMicTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'마이크 권한 필요'**
  String get permMicTitle;

  /// permMicUseCall (F20)
  ///
  /// In ko, this message translates to:
  /// **'통화에 사용합니다.'**
  String get permMicUseCall;

  /// permCamTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라 권한 필요'**
  String get permCamTitle;

  /// permCamUseVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'영상통화에 사용합니다.'**
  String get permCamUseVideo;

  /// backWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'뒤로'**
  String get backWord;

  /// permMicUseVoice (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성통화에 사용합니다.'**
  String get permMicUseVoice;

  /// callIncoming (F20)
  ///
  /// In ko, this message translates to:
  /// **'수신 중...'**
  String get callIncoming;

  /// callNoMedia (F20)
  ///
  /// In ko, this message translates to:
  /// **'미디어를 사용할 수 없습니다'**
  String get callNoMedia;

  /// callAccept (F20)
  ///
  /// In ko, this message translates to:
  /// **'수락'**
  String get callAccept;

  /// callUnmute (F20)
  ///
  /// In ko, this message translates to:
  /// **'음소거 해제'**
  String get callUnmute;

  /// callMute (F20)
  ///
  /// In ko, this message translates to:
  /// **'음소거'**
  String get callMute;

  /// callSpeaker (F20)
  ///
  /// In ko, this message translates to:
  /// **'스피커'**
  String get callSpeaker;

  /// callEnd (F20)
  ///
  /// In ko, this message translates to:
  /// **'통화 종료'**
  String get callEnd;

  /// channelsEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'등록된 공식 채널이 없습니다'**
  String get channelsEmpty;

  /// fileWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일'**
  String get fileWord;

  /// notifWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'알림'**
  String get notifWord;

  /// chatsTypeHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지를 입력해보세요'**
  String get chatsTypeHint;

  /// chatsUnreadFirst (F20)
  ///
  /// In ko, this message translates to:
  /// **'안 읽은 방 먼저'**
  String get chatsUnreadFirst;

  /// chatsMakeGroup (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 만들기'**
  String get chatsMakeGroup;

  /// chatsEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방이 없습니다.\n홈에서 친구를 찾아 대화를 시작해보세요.'**
  String get chatsEmpty;

  /// chatsInviteLinkOrToken (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크 또는 토큰'**
  String get chatsInviteLinkOrToken;

  /// chatsNoFriends (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대할 친구가 없습니다. 홈에서 친구를 먼저 추가하세요.'**
  String get chatsNoFriends;

  /// createWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'만들기'**
  String get createWord;

  /// chatsSearchHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화·친구 검색'**
  String get chatsSearchHint;

  /// archivePinnedTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'고정된 항로 지시'**
  String get archivePinnedTitle;

  /// noteWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'노트'**
  String get noteWord;

  /// archiveNotesDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방에 남긴 기록'**
  String get archiveNotesDesc;

  /// archiveNewNote (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 노트'**
  String get archiveNewNote;

  /// scheduleWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'일정'**
  String get scheduleWord;

  /// archiveEventsDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'예정된 집합 신호'**
  String get archiveEventsDesc;

  /// archiveNewEvent (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 일정'**
  String get archiveNewEvent;

  /// pollWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'투표'**
  String get pollWord;

  /// archivePollsDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'진행 중인 표결'**
  String get archivePollsDesc;

  /// archiveNewPoll (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 투표'**
  String get archiveNewPoll;

  /// albumWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'앨범'**
  String get albumWord;

  /// archiveAlbumsDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방 사진 묶음'**
  String get archiveAlbumsDesc;

  /// archiveNewAlbum (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 앨범'**
  String get archiveNewAlbum;

  /// archiveEmptyTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'등록된 {title}이(가) 없습니다'**
  String archiveEmptyTitle(String title);

  /// pollClosedVoters (F20)
  ///
  /// In ko, this message translates to:
  /// **'종료됨 · {count}명 참여'**
  String pollClosedVoters(int count);

  /// pollOpenVoters (F20)
  ///
  /// In ko, this message translates to:
  /// **'진행 중 · {count}명 참여'**
  String pollOpenVoters(int count);

  /// archiveMyStatus (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 응답: {status}'**
  String archiveMyStatus(String status);

  /// rsvpAttend (F20)
  ///
  /// In ko, this message translates to:
  /// **'참석'**
  String get rsvpAttend;

  /// rsvpTbd (F20)
  ///
  /// In ko, this message translates to:
  /// **'미정'**
  String get rsvpTbd;

  /// rsvpDecline (F20)
  ///
  /// In ko, this message translates to:
  /// **'불참'**
  String get rsvpDecline;

  /// archiveNoRsvp (F20)
  ///
  /// In ko, this message translates to:
  /// **'아직 응답하지 않았습니다'**
  String get archiveNoRsvp;

  /// titleRequired (F20)
  ///
  /// In ko, this message translates to:
  /// **'제목 (필수)'**
  String get titleRequired;

  /// contentWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'내용'**
  String get contentWord;

  /// archivePickStart (F20)
  ///
  /// In ko, this message translates to:
  /// **'시작 시각을 고르세요 (필수)'**
  String get archivePickStart;

  /// dateTimeWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'날짜·시간'**
  String get dateTimeWord;

  /// placeOptional (F20)
  ///
  /// In ko, this message translates to:
  /// **'장소 (선택)'**
  String get placeOptional;

  /// pollQuestionReq (F20)
  ///
  /// In ko, this message translates to:
  /// **'질문 (필수)'**
  String get pollQuestionReq;

  /// pollOptionsHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'선택지 (줄마다 하나씩, 2~10개)'**
  String get pollOptionsHint;

  /// albumTitleReq (F20)
  ///
  /// In ko, this message translates to:
  /// **'앨범 제목 (필수)'**
  String get albumTitleReq;

  /// archiveAlbumDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방 사진 한 번에 담기'**
  String get archiveAlbumDesc;

  /// roomAutoTranslateOn (F20)
  ///
  /// In ko, this message translates to:
  /// **'자동 번역 켜짐 · 번역 준비 중'**
  String get roomAutoTranslateOn;

  /// roomAutoOnLang (F20)
  ///
  /// In ko, this message translates to:
  /// **'자동 번역 켜짐 · {lang}'**
  String roomAutoOnLang(String lang);

  /// roomReplying (F20)
  ///
  /// In ko, this message translates to:
  /// **'답장 작성 중...'**
  String get roomReplying;

  /// roomReplyWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'답장'**
  String get roomReplyWord;

  /// roomListTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화 목록'**
  String get roomListTitle;

  /// roomOfflineSync (F20)
  ///
  /// In ko, this message translates to:
  /// **'오프라인 동기화'**
  String get roomOfflineSync;

  /// roomImageFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'이미지를 불러올 수 없습니다'**
  String get roomImageFail;

  /// contactWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'연락처'**
  String get contactWord;

  /// roomForwarded (F20)
  ///
  /// In ko, this message translates to:
  /// **'➦ 전달됨'**
  String get roomForwarded;

  /// roomReadCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'읽음 {count}'**
  String roomReadCount(int count);

  /// roomEdited (F20)
  ///
  /// In ko, this message translates to:
  /// **'(수정됨)'**
  String get roomEdited;

  /// roomPinBody (F20)
  ///
  /// In ko, this message translates to:
  /// **'공지: {body}'**
  String roomPinBody(String body);

  /// roomLoginNotice (F20)
  ///
  /// In ko, this message translates to:
  /// **'{device}에서 LUNO에 로그인했습니다.'**
  String roomLoginNotice(String device);

  /// roomSecurityAdvice (F20)
  ///
  /// In ko, this message translates to:
  /// **'본인이 로그인하지 않았다면 아래 버튼을 눌러 로그아웃해 주세요. 안전한 LUNO 이용을 위해 비밀번호 변경을 권장합니다.'**
  String get roomSecurityAdvice;

  /// roomIpAddr (F20)
  ///
  /// In ko, this message translates to:
  /// **'IP 주소: {ip}'**
  String roomIpAddr(String ip);

  /// roomLocation (F20)
  ///
  /// In ko, this message translates to:
  /// **'위치: {location}'**
  String roomLocation(String location);

  /// sampleDataWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'샘플 데이터'**
  String get sampleDataWord;

  /// roomEditTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지 수정'**
  String get roomEditTitle;

  /// messageWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지'**
  String get messageWord;

  /// roomLatHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'위도 (-90 ~ 90)'**
  String get roomLatHint;

  /// roomLonHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'경도 (-180 ~ 180)'**
  String get roomLonHint;

  /// roomPlaceName (F20)
  ///
  /// In ko, this message translates to:
  /// **'장소 이름 (선택)'**
  String get roomPlaceName;

  /// shareWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'공유'**
  String get shareWord;

  /// roomNoShareFriends (F20)
  ///
  /// In ko, this message translates to:
  /// **'공유할 친구가 없습니다.'**
  String get roomNoShareFriends;

  /// roomNewPwHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 비밀번호 (8자 이상)'**
  String get roomNewPwHint;

  /// changeWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'변경'**
  String get changeWord;

  /// permMicUseVoiceMsg (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성 메시지를 녹음하는 데 사용합니다.'**
  String get permMicUseVoiceMsg;

  /// permCamUsePhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'채팅에 보낼 사진을 촬영하는 데 사용합니다.'**
  String get permCamUsePhoto;

  /// permCamUsePhotoVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'채팅에 보낼 사진·동영상을 촬영하는 데 사용합니다.'**
  String get permCamUsePhotoVideo;

  /// roomPickGallery (F20)
  ///
  /// In ko, this message translates to:
  /// **'갤러리에서 선택'**
  String get roomPickGallery;

  /// roomTakePhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라로 촬영'**
  String get roomTakePhoto;

  /// voiceMsgWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성 메시지'**
  String get voiceMsgWord;

  /// roomComposerHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지를 입력하세요'**
  String get roomComposerHint;

  /// proposalPending (F20)
  ///
  /// In ko, this message translates to:
  /// **'대기 중'**
  String get proposalPending;

  /// userWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용자'**
  String get userWord;

  /// consoleUsers (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정 명부'**
  String get consoleUsers;

  /// reportWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'신고'**
  String get reportWord;

  /// consoleSafetyBox (F20)
  ///
  /// In ko, this message translates to:
  /// **'안전 신고함'**
  String get consoleSafetyBox;

  /// flagWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'플래그'**
  String get flagWord;

  /// consoleSwitches (F20)
  ///
  /// In ko, this message translates to:
  /// **'기능 스위치'**
  String get consoleSwitches;

  /// consoleAuditLog (F20)
  ///
  /// In ko, this message translates to:
  /// **'감사 로그'**
  String get consoleAuditLog;

  /// consoleLedger (F20)
  ///
  /// In ko, this message translates to:
  /// **'불변 기록부'**
  String get consoleLedger;

  /// consoleHarborDesk (F20)
  ///
  /// In ko, this message translates to:
  /// **'하버마스터 관제 데스크'**
  String get consoleHarborDesk;

  /// consoleNoMetrics (F20)
  ///
  /// In ko, this message translates to:
  /// **'지표를 불러오는 중이거나 권한이 없습니다'**
  String get consoleNoMetrics;

  /// consoleAct (F20)
  ///
  /// In ko, this message translates to:
  /// **'조치'**
  String get consoleAct;

  /// consoleModAction (F20)
  ///
  /// In ko, this message translates to:
  /// **'모더레이션 조치'**
  String get consoleModAction;

  /// consoleTargetUuid (F20)
  ///
  /// In ko, this message translates to:
  /// **'대상 사용자 UUID'**
  String get consoleTargetUuid;

  /// modWarn (F20)
  ///
  /// In ko, this message translates to:
  /// **'경고'**
  String get modWarn;

  /// modSuspend (F20)
  ///
  /// In ko, this message translates to:
  /// **'정지'**
  String get modSuspend;

  /// modRestore (F20)
  ///
  /// In ko, this message translates to:
  /// **'복구'**
  String get modRestore;

  /// modDismiss (F20)
  ///
  /// In ko, this message translates to:
  /// **'기각'**
  String get modDismiss;

  /// reasonOptional (F20)
  ///
  /// In ko, this message translates to:
  /// **'사유 (선택)'**
  String get reasonOptional;

  /// logWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'기록'**
  String get logWord;

  /// consoleFlagPanel (F20)
  ///
  /// In ko, this message translates to:
  /// **'기능 스위치 제어반'**
  String get consoleFlagPanel;

  /// consoleNoFlags (F20)
  ///
  /// In ko, this message translates to:
  /// **'등록된 플래그가 없습니다'**
  String get consoleNoFlags;

  /// feedLogTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 항해 일지'**
  String get feedLogTitle;

  /// feedComposerHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 피드에 새로운 소식을 공유하세요...'**
  String get feedComposerHint;

  /// feedPublish (F20)
  ///
  /// In ko, this message translates to:
  /// **'피드 게시'**
  String get feedPublish;

  /// feedEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'아직 피드 글이 없습니다.\n첫 소식을 공유해보세요.'**
  String get feedEmpty;

  /// feedCommentCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'댓글 {count}개'**
  String feedCommentCount(int count);

  /// groupSelfName (F20)
  ///
  /// In ko, this message translates to:
  /// **'{name} (나)'**
  String groupSelfName(String name);

  /// groupCallWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 통화'**
  String get groupCallWord;

  /// videoWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'영상'**
  String get videoWord;

  /// voiceWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성'**
  String get voiceWord;

  /// groupCallStatus (F20)
  ///
  /// In ko, this message translates to:
  /// **'{kind} · {duration} · {seats}명 참가 중'**
  String groupCallStatus(String kind, String duration, int seats);

  /// groupNoNotice (F20)
  ///
  /// In ko, this message translates to:
  /// **'공지 없음'**
  String get groupNoNotice;

  /// groupInvite (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대하기'**
  String get groupInvite;

  /// groupNewLink (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 링크 (7일)'**
  String get groupNewLink;

  /// groupLeave (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹 나가기'**
  String get groupLeave;

  /// groupInviteQr (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크 QR'**
  String get groupInviteQr;

  /// confirmWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'확인'**
  String get confirmWord;

  /// myProfile (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 프로필'**
  String get myProfile;

  /// homeStatusHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'상태 메시지 입력'**
  String get homeStatusHint;

  /// homeQrApprove (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC/웹 QR 승인'**
  String get homeQrApprove;

  /// serviceWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'서비스'**
  String get serviceWord;

  /// storyWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'스토리'**
  String get storyWord;

  /// homeFriendsManage (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구 관리'**
  String get homeFriendsManage;

  /// homeUnfavorite (F20)
  ///
  /// In ko, this message translates to:
  /// **'즐겨찾기 해제'**
  String get homeUnfavorite;

  /// homeBlock (F20)
  ///
  /// In ko, this message translates to:
  /// **'차단하기'**
  String get homeBlock;

  /// homeQrLoginTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC/웹 로그인 승인'**
  String get homeQrLoginTitle;

  /// homeQrManualHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC 화면의 QR 아래 표시된 값을 입력하세요.'**
  String get homeQrManualHint;

  /// homeScanCamera (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라로 스캔'**
  String get homeScanCamera;

  /// homeDetailOptional (F20)
  ///
  /// In ko, this message translates to:
  /// **'상세 내용 (선택)'**
  String get homeDetailOptional;

  /// keepTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'보관한 신호 모음'**
  String get keepTitle;

  /// keepEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'보관한 항목이 없습니다'**
  String get keepEmpty;

  /// keepHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화방에서 책갈피 표시로 보관하세요'**
  String get keepHint;

  /// loungeTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 글로벌 라운지 커뮤니티'**
  String get loungeTitle;

  /// loungeNew (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 라운지'**
  String get loungeNew;

  /// loungeJoin (F20)
  ///
  /// In ko, this message translates to:
  /// **'참여'**
  String get loungeJoin;

  /// loungeEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'개설된 라운지가 없습니다'**
  String get loungeEmpty;

  /// loungeRowDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'{desc} · 참여 {count}명'**
  String loungeRowDesc(String desc, int count);

  /// loungeNickname (F20)
  ///
  /// In ko, this message translates to:
  /// **'쓸 닉네임'**
  String get loungeNickname;

  /// loungeList (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지 목록'**
  String get loungeList;

  /// loungeNoPosts (F20)
  ///
  /// In ko, this message translates to:
  /// **'아직 글이 없습니다. 첫 글을 올려보세요.'**
  String get loungeNoPosts;

  /// loungeUnlike (F20)
  ///
  /// In ko, this message translates to:
  /// **'좋아요 취소'**
  String get loungeUnlike;

  /// loungeWrite (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지에 글쓰기'**
  String get loungeWrite;

  /// loungePost (F20)
  ///
  /// In ko, this message translates to:
  /// **'올리기'**
  String get loungePost;

  /// loungeNameReq (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지 이름 (필수)'**
  String get loungeNameReq;

  /// loungeIntroOpt (F20)
  ///
  /// In ko, this message translates to:
  /// **'소개 (선택)'**
  String get loungeIntroOpt;

  /// loungeMyNickOpt (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 닉네임 (선택)'**
  String get loungeMyNickOpt;

  /// loungeOpen (F20)
  ///
  /// In ko, this message translates to:
  /// **'개설'**
  String get loungeOpen;

  /// newsEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'표시할 뉴스가 없습니다'**
  String get newsEmpty;

  /// newsPullRefresh (F20)
  ///
  /// In ko, this message translates to:
  /// **'아래로 당겨 새로고침하세요'**
  String get newsPullRefresh;

  /// newsArticleWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'기사'**
  String get newsArticleWord;

  /// newsNotFound (F20)
  ///
  /// In ko, this message translates to:
  /// **'전보를 찾을 수 없습니다'**
  String get newsNotFound;

  /// newsReload (F20)
  ///
  /// In ko, this message translates to:
  /// **'뉴스 다시 불러오기'**
  String get newsReload;

  /// privacyTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'개인 정보 보호'**
  String get privacyTitle;

  /// privacyIdAdd (F20)
  ///
  /// In ko, this message translates to:
  /// **'ID로 친구 추가 허용'**
  String get privacyIdAdd;

  /// privacyIdAddDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'다른 사람이 내 ID를 검색하여 친구로 추가할 수 있습니다.'**
  String get privacyIdAddDesc;

  /// privacyE2ee (F20)
  ///
  /// In ko, this message translates to:
  /// **'종단간 암호화 (E2EE)'**
  String get privacyE2ee;

  /// privacyE2eePreparing (F20)
  ///
  /// In ko, this message translates to:
  /// **'준비 중 — 현재 전송 구간 암호화(TLS)만 적용됩니다'**
  String get privacyE2eePreparing;

  /// privacyDevices (F20)
  ///
  /// In ko, this message translates to:
  /// **'로그인된 기기'**
  String get privacyDevices;

  /// privacyDevicesRefresh (F20)
  ///
  /// In ko, this message translates to:
  /// **'기기 목록 새로고침'**
  String get privacyDevicesRefresh;

  /// privacyNoDevices (F20)
  ///
  /// In ko, this message translates to:
  /// **'표시할 기기가 없습니다'**
  String get privacyNoDevices;

  /// privacyLastSeen (F20)
  ///
  /// In ko, this message translates to:
  /// **'최근 활동 {seen}'**
  String privacyLastSeen(String seen);

  /// privacyUnknownDevice (F20)
  ///
  /// In ko, this message translates to:
  /// **'알 수 없는 기기'**
  String get privacyUnknownDevice;

  /// privacyThisDevice (F20)
  ///
  /// In ko, this message translates to:
  /// **'현재 기기'**
  String get privacyThisDevice;

  /// profileUnset (F20)
  ///
  /// In ko, this message translates to:
  /// **'설정 안 함'**
  String get profileUnset;

  /// profileTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필'**
  String get profileTitle;

  /// profileName (F20)
  ///
  /// In ko, this message translates to:
  /// **'이름'**
  String get profileName;

  /// profileStatus (F20)
  ///
  /// In ko, this message translates to:
  /// **'상태 메시지'**
  String get profileStatus;

  /// profileMyQr (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 QR 코드'**
  String get profileMyQr;

  /// profileUnsetShort (F20)
  ///
  /// In ko, this message translates to:
  /// **'미설정'**
  String get profileUnsetShort;

  /// profileIdCopied (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO ID를 복사했습니다.'**
  String get profileIdCopied;

  /// profileBirthday (F20)
  ///
  /// In ko, this message translates to:
  /// **'생일'**
  String get profileBirthday;

  /// profileBirthdayHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'생일 (MM-DD, 비우면 지움)'**
  String get profileBirthdayHint;

  /// profilePhotoSetup (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진 및 배경 설정'**
  String get profilePhotoSetup;

  /// profilePhotoSetupDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진과 배경을 설정할 수 있습니다.'**
  String get profilePhotoSetupDesc;

  /// profileQrHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라로 스캔하면 친구로 추가할 수 있습니다.'**
  String get profileQrHint;

  /// profileCover (F20)
  ///
  /// In ko, this message translates to:
  /// **'커버 사진'**
  String get profileCover;

  /// profilePhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진'**
  String get profilePhoto;

  /// cameraWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라'**
  String get cameraWord;

  /// profilePickPhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'사진 선택'**
  String get profilePickPhoto;

  /// profileDeleteCover (F20)
  ///
  /// In ko, this message translates to:
  /// **'커버 사진 삭제'**
  String get profileDeleteCover;

  /// profileDeletePhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진 삭제'**
  String get profileDeletePhoto;

  /// qrNotLunoRescan (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO QR 코드가 아닙니다. 다시 비춰주세요.'**
  String get qrNotLunoRescan;

  /// qrScanTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'QR 스캔'**
  String get qrScanTitle;

  /// qrScanSubtitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC 로그인 · 친구 추가'**
  String get qrScanSubtitle;

  /// qrNoCamera (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라를 사용할 수 없습니다. 아래에서 직접 입력해 주세요.'**
  String get qrNoCamera;

  /// qrManualClose (F20)
  ///
  /// In ko, this message translates to:
  /// **'직접 입력 닫기'**
  String get qrManualClose;

  /// qrManualOpen (F20)
  ///
  /// In ko, this message translates to:
  /// **'직접 입력하기'**
  String get qrManualOpen;

  /// qrAddFriend (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구 추가'**
  String get qrAddFriend;

  /// qrVerifyTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'QR 확인'**
  String get qrVerifyTitle;

  /// qrApprove (F20)
  ///
  /// In ko, this message translates to:
  /// **'승인하기'**
  String get qrApprove;

  /// qrAddNow (F20)
  ///
  /// In ko, this message translates to:
  /// **'추가하기'**
  String get qrAddNow;

  /// qrNotLuno (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO QR 코드가 아닙니다.'**
  String get qrNotLuno;

  /// searchClear (F20)
  ///
  /// In ko, this message translates to:
  /// **'지우기'**
  String get searchClear;

  /// searchNoRecent (F20)
  ///
  /// In ko, this message translates to:
  /// **'최근 검색어가 없습니다'**
  String get searchNoRecent;

  /// searchNoResult (F20)
  ///
  /// In ko, this message translates to:
  /// **'검색 결과가 없습니다'**
  String get searchNoResult;

  /// searchDeleteRecent (F20)
  ///
  /// In ko, this message translates to:
  /// **'최근 검색 삭제'**
  String get searchDeleteRecent;

  /// settingsPrivacy (F20)
  ///
  /// In ko, this message translates to:
  /// **'개인 정보'**
  String get settingsPrivacy;

  /// settingsLinkPreview (F20)
  ///
  /// In ko, this message translates to:
  /// **'링크 미리보기'**
  String get settingsLinkPreview;

  /// settingsLinkPreviewDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화의 https 링크 아래에 제목·설명·이미지를 보여줍니다.'**
  String get settingsLinkPreviewDesc;

  /// settingsExport (F20)
  ///
  /// In ko, this message translates to:
  /// **'데이터 내보내기'**
  String get settingsExport;

  /// settingsExportDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'대화·친구·미디어 메타데이터 (GDPR)'**
  String get settingsExportDesc;

  /// settingsPrivacyDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'ID 검색 허용·로그인 기기 관리'**
  String get settingsPrivacyDesc;

  /// settingsReportsDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'접수한 신고와 처리 상태'**
  String get settingsReportsDesc;

  /// settingsNotify (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 메시지·전화 알림'**
  String get settingsNotify;

  /// settingsNotifyDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'앱이 백그라운드에 있을 때만 울립니다.'**
  String get settingsNotifyDesc;

  /// settingsNotifyPerm (F20)
  ///
  /// In ko, this message translates to:
  /// **'알림 권한 필요'**
  String get settingsNotifyPerm;

  /// settingsNotifyPermDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 메시지와 수신 전화를 알려주는 데 사용합니다.'**
  String get settingsNotifyPermDesc;

  /// settingsAutoTranslate (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 메시지 자동 번역'**
  String get settingsAutoTranslate;

  /// settingsTranslatePreparing (F20)
  ///
  /// In ko, this message translates to:
  /// **'준비 중 — 번역 엔진 연결 전까지 켜도 번역되지 않습니다.'**
  String get settingsTranslatePreparing;

  /// settingsTargetLang (F20)
  ///
  /// In ko, this message translates to:
  /// **'번역 대상 언어'**
  String get settingsTargetLang;

  /// translatePreparing (F20)
  ///
  /// In ko, this message translates to:
  /// **'번역 준비 중'**
  String get translatePreparing;

  /// deviceWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'기기'**
  String get deviceWord;

  /// settingsQrApprove (F20)
  ///
  /// In ko, this message translates to:
  /// **'데스크톱 QR 로그인 승인'**
  String get settingsQrApprove;

  /// settingsQrApproveDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC/웹 QR 챌린지를 승인합니다'**
  String get settingsQrApproveDesc;

  /// settingsAppInfo (F20)
  ///
  /// In ko, this message translates to:
  /// **'앱 정보'**
  String get settingsAppInfo;

  /// settingsAppUpdate (F20)
  ///
  /// In ko, this message translates to:
  /// **'앱 업데이트'**
  String get settingsAppUpdate;

  /// accountWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정'**
  String get accountWord;

  /// settingsDeleteAccount (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정 탈퇴'**
  String get settingsDeleteAccount;

  /// settingsDeleteWarn (F20)
  ///
  /// In ko, this message translates to:
  /// **'모든 메시지·친구·미디어가 영구 삭제됩니다'**
  String get settingsDeleteWarn;

  /// settingsCheckUpdate (F20)
  ///
  /// In ko, this message translates to:
  /// **'탭하여 새 버전 확인'**
  String get settingsCheckUpdate;

  /// settingsDesktopApproved (F20)
  ///
  /// In ko, this message translates to:
  /// **'데스크톱 승인 완료'**
  String get settingsDesktopApproved;

  /// settingsDeleteConfirm (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정을 삭제할까요?'**
  String get settingsDeleteConfirm;

  /// settingsDeleteGrace (F20)
  ///
  /// In ko, this message translates to:
  /// **'30일의 유예 뒤 모든 데이터가 삭제됩니다. 유예 안에 로그인하면 복구됩니다. 계속하려면 비밀번호와 이메일을 입력하세요.'**
  String get settingsDeleteGrace;

  /// settingsPwConfirm (F20)
  ///
  /// In ko, this message translates to:
  /// **'비밀번호 확인'**
  String get settingsPwConfirm;

  /// settingsDeleteReason (F20)
  ///
  /// In ko, this message translates to:
  /// **'탈퇴 사유 (선택)'**
  String get settingsDeleteReason;

  /// settingsScheduleDelete (F20)
  ///
  /// In ko, this message translates to:
  /// **'삭제 예약'**
  String get settingsScheduleDelete;

  /// settingsLangKo (F20)
  ///
  /// In ko, this message translates to:
  /// **'한국어 (KO)'**
  String get settingsLangKo;

  /// shopTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 쇼핑'**
  String get shopTitle;

  /// shopPreparing (F20)
  ///
  /// In ko, this message translates to:
  /// **'결제 연동 준비 중이라 둘러보기만 가능합니다. 구매는 결제사가 연동되면 열립니다.'**
  String get shopPreparing;

  /// storyEphemeral (F20)
  ///
  /// In ko, this message translates to:
  /// **'24시간 뒤에 사라지는 항로 기록'**
  String get storyEphemeral;

  /// storyWrite (F20)
  ///
  /// In ko, this message translates to:
  /// **'스토리 쓰기'**
  String get storyWrite;

  /// storyEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'표시할 스토리가 없습니다'**
  String get storyEmpty;

  /// storyHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'가벼운 일상 한 줄'**
  String get storyHint;

  /// storyPost (F20)
  ///
  /// In ko, this message translates to:
  /// **'게시'**
  String get storyPost;

  /// walletBalance (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO Pay 머니 잔액'**
  String get walletBalance;

  /// walletTopup (F20)
  ///
  /// In ko, this message translates to:
  /// **'충전 금액'**
  String get walletTopup;

  /// walletTopupNumber (F20)
  ///
  /// In ko, this message translates to:
  /// **'충전 금액을 숫자로 입력해 주세요.'**
  String get walletTopupNumber;

  /// walletTopupBtn (F20)
  ///
  /// In ko, this message translates to:
  /// **'+ 충전'**
  String get walletTopupBtn;

  /// walletProtect (F20)
  ///
  /// In ko, this message translates to:
  /// **'간편 송금 & 결제 보호'**
  String get walletProtect;

  /// walletRecent (F20)
  ///
  /// In ko, this message translates to:
  /// **'최근 기록'**
  String get walletRecent;

  /// walletTxWord (F20)
  ///
  /// In ko, this message translates to:
  /// **'거래'**
  String get walletTxWord;

  /// errTransient (F20)
  ///
  /// In ko, this message translates to:
  /// **'일시적인 오류입니다. 다시 시도해주세요.'**
  String get errTransient;

  /// errNetwork (F20)
  ///
  /// In ko, this message translates to:
  /// **'네트워크 연결 오류. 다시 시도해주세요.'**
  String get errNetwork;

  /// msgEmailVerified (F20)
  ///
  /// In ko, this message translates to:
  /// **'이메일 인증이 완료되었습니다. 로그인해주세요.'**
  String get msgEmailVerified;

  /// msgAccountCreated (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 계정이 생성되었습니다. 로그인해주세요.'**
  String get msgAccountCreated;

  /// msgQrApproved (F20)
  ///
  /// In ko, this message translates to:
  /// **'PC/웹 데스크톱 로그인을 승인했습니다.'**
  String get msgQrApproved;

  /// msgReconnecting (F20)
  ///
  /// In ko, this message translates to:
  /// **'연결이 끊어졌습니다. 재연결 중...'**
  String get msgReconnecting;

  /// msgNewMessage (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 메시지'**
  String get msgNewMessage;

  /// kindPhoto (F20)
  ///
  /// In ko, this message translates to:
  /// **'[사진]'**
  String get kindPhoto;

  /// kindVideo (F20)
  ///
  /// In ko, this message translates to:
  /// **'[동영상]'**
  String get kindVideo;

  /// kindFile (F20)
  ///
  /// In ko, this message translates to:
  /// **'[파일]'**
  String get kindFile;

  /// kindVoice (F20)
  ///
  /// In ko, this message translates to:
  /// **'[음성 메시지]'**
  String get kindVoice;

  /// kindSticker (F20)
  ///
  /// In ko, this message translates to:
  /// **'[스티커]'**
  String get kindSticker;

  /// kindLocation (F20)
  ///
  /// In ko, this message translates to:
  /// **'[위치]'**
  String get kindLocation;

  /// kindContact (F20)
  ///
  /// In ko, this message translates to:
  /// **'[연락처]'**
  String get kindContact;

  /// kindNewMessage (F20)
  ///
  /// In ko, this message translates to:
  /// **'[새 메시지]'**
  String get kindNewMessage;

  /// msgFriendAdded (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구를 추가했습니다.'**
  String get msgFriendAdded;

  /// msgAlreadyFriend (F20)
  ///
  /// In ko, this message translates to:
  /// **'이미 친구입니다.'**
  String get msgAlreadyFriend;

  /// msgAlreadyFriendName (F20)
  ///
  /// In ko, this message translates to:
  /// **'이미 친구입니다 ({name}).'**
  String msgAlreadyFriendName(String name);

  /// msgAddedAsFriend (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구로 추가했습니다.'**
  String get msgAddedAsFriend;

  /// msgAddedNameAsFriend (F20)
  ///
  /// In ko, this message translates to:
  /// **'{name}님을 친구로 추가했습니다.'**
  String msgAddedNameAsFriend(String name);

  /// msgQrUserMissing (F20)
  ///
  /// In ko, this message translates to:
  /// **'QR 속 사용자를 찾을 수 없습니다.'**
  String get msgQrUserMissing;

  /// msgQrNotAddable (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구 추가할 수 없는 사용자입니다.'**
  String get msgQrNotAddable;

  /// msgOutboxSent (F20)
  ///
  /// In ko, this message translates to:
  /// **'대기 중이던 메시지 {sent}건을 보냈습니다.'**
  String msgOutboxSent(int sent);

  /// errOutboxDropped (F20)
  ///
  /// In ko, this message translates to:
  /// **'거부된 대기 메시지 {dropped}건을 버렸습니다.'**
  String errOutboxDropped(int dropped);

  /// msgEdited (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지를 수정했습니다.'**
  String get msgEdited;

  /// msgQueuedOffline (F20)
  ///
  /// In ko, this message translates to:
  /// **'오프라인 — 메시지를 대기열에 저장했습니다.'**
  String get msgQueuedOffline;

  /// errFileTooBig (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일이 너무 큽니다 (최대 512KB)'**
  String get errFileTooBig;

  /// msgLocationShared (F20)
  ///
  /// In ko, this message translates to:
  /// **'위치를 공유했습니다.'**
  String get msgLocationShared;

  /// msgContactShared (F20)
  ///
  /// In ko, this message translates to:
  /// **'연락처를 공유했습니다.'**
  String get msgContactShared;

  /// errTranslateFailed (F20)
  ///
  /// In ko, this message translates to:
  /// **'번역 실패'**
  String get errTranslateFailed;

  /// msgSendCancelled (F20)
  ///
  /// In ko, this message translates to:
  /// **'메시지 전송을 취소했습니다.'**
  String get msgSendCancelled;

  /// msgReactionLeft (F20)
  ///
  /// In ko, this message translates to:
  /// **'{emoji} 리액션을 남겼습니다.'**
  String msgReactionLeft(String emoji);

  /// msgApproved (F20)
  ///
  /// In ko, this message translates to:
  /// **'승인했습니다.'**
  String get msgApproved;

  /// msgDeclined (F20)
  ///
  /// In ko, this message translates to:
  /// **'거절했습니다.'**
  String get msgDeclined;

  /// msgPinned (F20)
  ///
  /// In ko, this message translates to:
  /// **'공지로 등록했습니다.'**
  String get msgPinned;

  /// msgKept (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO Keep에 보관했습니다.'**
  String get msgKept;

  /// msgFeedPosted (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO 피드 포스트를 게시했습니다.'**
  String get msgFeedPosted;

  /// msgStoryPosted (F20)
  ///
  /// In ko, this message translates to:
  /// **'스토리를 게시했습니다.'**
  String get msgStoryPosted;

  /// msgRoomRenamed (F20)
  ///
  /// In ko, this message translates to:
  /// **'방 이름을 바꿨습니다.'**
  String get msgRoomRenamed;

  /// msgNoticeSaved (F20)
  ///
  /// In ko, this message translates to:
  /// **'공지를 저장했습니다.'**
  String get msgNoticeSaved;

  /// errRoomPhotoBig (F20)
  ///
  /// In ko, this message translates to:
  /// **'방 사진이 너무 큽니다 (최대 256KB)'**
  String get errRoomPhotoBig;

  /// errPhotoType (F20)
  ///
  /// In ko, this message translates to:
  /// **'지원하지 않는 사진 형식입니다 (JPEG/PNG/WebP).'**
  String get errPhotoType;

  /// msgRoomPhotoSet (F20)
  ///
  /// In ko, this message translates to:
  /// **'방 사진을 바꿨습니다.'**
  String get msgRoomPhotoSet;

  /// msgRoomPhotoCleared (F20)
  ///
  /// In ko, this message translates to:
  /// **'방 사진을 지웠습니다.'**
  String get msgRoomPhotoCleared;

  /// msgExported (F20)
  ///
  /// In ko, this message translates to:
  /// **'내보냈습니다.'**
  String get msgExported;

  /// msgMadeAdmin (F20)
  ///
  /// In ko, this message translates to:
  /// **'관리자로 지정했습니다.'**
  String get msgMadeAdmin;

  /// msgMadeMember (F20)
  ///
  /// In ko, this message translates to:
  /// **'일반 멤버로 바꿨습니다.'**
  String get msgMadeMember;

  /// msgOwnerPassed (F20)
  ///
  /// In ko, this message translates to:
  /// **'방장을 넘겼습니다.'**
  String get msgOwnerPassed;

  /// msgLeftGroup (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹에서 나갔습니다.'**
  String get msgLeftGroup;

  /// msgInviteMade (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크를 만들었습니다.'**
  String get msgInviteMade;

  /// msgInviteRevoked (F20)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크를 폐기했습니다.'**
  String get msgInviteRevoked;

  /// msgJoinedGroup (F20)
  ///
  /// In ko, this message translates to:
  /// **'그룹에 참여했습니다.'**
  String get msgJoinedGroup;

  /// msgNoteSaved (F20)
  ///
  /// In ko, this message translates to:
  /// **'노트를 저장했습니다.'**
  String get msgNoteSaved;

  /// msgEventMade (F20)
  ///
  /// In ko, this message translates to:
  /// **'일정을 등록했습니다.'**
  String get msgEventMade;

  /// errPollNeedsOptions (F20)
  ///
  /// In ko, this message translates to:
  /// **'질문과 선택지 2개 이상이 필요합니다.'**
  String get errPollNeedsOptions;

  /// msgPollMade (F20)
  ///
  /// In ko, this message translates to:
  /// **'투표를 만들었습니다.'**
  String get msgPollMade;

  /// msgVoted (F20)
  ///
  /// In ko, this message translates to:
  /// **'투표했습니다.'**
  String get msgVoted;

  /// msgRsvpSent (F20)
  ///
  /// In ko, this message translates to:
  /// **'참석 여부를 보냈습니다.'**
  String get msgRsvpSent;

  /// msgAlbumMade (F20)
  ///
  /// In ko, this message translates to:
  /// **'앨범을 만들었습니다.'**
  String get msgAlbumMade;

  /// errProfilePhotoBig (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진이 너무 큽니다 (최대 256KB)'**
  String get errProfilePhotoBig;

  /// msgProfilePhotoSet (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필 사진을 바꿨습니다.'**
  String get msgProfilePhotoSet;

  /// msgProfileSaved (F20)
  ///
  /// In ko, this message translates to:
  /// **'프로필을 저장했습니다.'**
  String get msgProfileSaved;

  /// errCoverBig (F20)
  ///
  /// In ko, this message translates to:
  /// **'커버 사진이 너무 큽니다 (최대 256KB)'**
  String get errCoverBig;

  /// msgCoverSet (F20)
  ///
  /// In ko, this message translates to:
  /// **'커버 사진을 바꿨습니다.'**
  String get msgCoverSet;

  /// errPrefsLoad (F20)
  ///
  /// In ko, this message translates to:
  /// **'설정을 불러오지 못했습니다.'**
  String get errPrefsLoad;

  /// msgIdSearchOn (F20)
  ///
  /// In ko, this message translates to:
  /// **'ID 검색을 허용했습니다.'**
  String get msgIdSearchOn;

  /// msgIdSearchOff (F20)
  ///
  /// In ko, this message translates to:
  /// **'ID 검색을 차단했습니다.'**
  String get msgIdSearchOff;

  /// msgPreviewOn (F20)
  ///
  /// In ko, this message translates to:
  /// **'링크 미리보기를 켰습니다.'**
  String get msgPreviewOn;

  /// msgPreviewOff (F20)
  ///
  /// In ko, this message translates to:
  /// **'링크 미리보기를 껐습니다.'**
  String get msgPreviewOff;

  /// msgLeftLounge (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지에서 나갔습니다.'**
  String get msgLeftLounge;

  /// msgPostedLounge (F20)
  ///
  /// In ko, this message translates to:
  /// **'라운지에 올렸습니다.'**
  String get msgPostedLounge;

  /// errNoFilePicked (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일을 선택하지 않았습니다.'**
  String get errNoFilePicked;

  /// errFileUnreadable (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일을 읽을 수 없습니다.'**
  String get errFileUnreadable;

  /// errFileTooBig14 (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일이 너무 큽니다 (최대 약 1.4MB)'**
  String get errFileTooBig14;

  /// msgSavedAs (F20)
  ///
  /// In ko, this message translates to:
  /// **'저장됨: {name}'**
  String msgSavedAs(String name);

  /// errPayDmOnly (F20)
  ///
  /// In ko, this message translates to:
  /// **'1:1 대화방에서만 송금할 수 있습니다.'**
  String get errPayDmOnly;

  /// payNoteRoom (F20)
  ///
  /// In ko, this message translates to:
  /// **'{title} 송금'**
  String payNoteRoom(String title);

  /// msgDeleteScheduled (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정 삭제가 예약되었습니다. 30일 안에 로그인하면 복구됩니다.'**
  String get msgDeleteScheduled;

  /// msgLoggedOutHere (F20)
  ///
  /// In ko, this message translates to:
  /// **'현재 기기에서 로그아웃했습니다.'**
  String get msgLoggedOutHere;

  /// msgLoggedOutTarget (F20)
  ///
  /// In ko, this message translates to:
  /// **'해당 기기에서 로그아웃했습니다.'**
  String get msgLoggedOutTarget;

  /// msgPwChanged (F20)
  ///
  /// In ko, this message translates to:
  /// **'비밀번호를 변경했습니다.'**
  String get msgPwChanged;

  /// msgDeviceLoggedOut (F20)
  ///
  /// In ko, this message translates to:
  /// **'기기에서 로그아웃했습니다.'**
  String get msgDeviceLoggedOut;

  /// msgModLogged (F20)
  ///
  /// In ko, this message translates to:
  /// **'모더레이션 조치를 기록했습니다.'**
  String get msgModLogged;

  /// msgFlagSaved2 (F20)
  ///
  /// In ko, this message translates to:
  /// **'플래그를 저장했습니다.'**
  String get msgFlagSaved2;

  /// relMinutesAgo (F20)
  ///
  /// In ko, this message translates to:
  /// **'{n}분 전'**
  String relMinutesAgo(int n);

  /// relHoursAgo (F20)
  ///
  /// In ko, this message translates to:
  /// **'{n}시간 전'**
  String relHoursAgo(int n);

  /// relDaysAgo (F20)
  ///
  /// In ko, this message translates to:
  /// **'{n}일 전'**
  String relDaysAgo(int n);

  /// callIncomingTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'수신된 통화'**
  String get callIncomingTitle;

  /// notifMsgChannel (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 메시지 알림'**
  String get notifMsgChannel;

  /// notifCallChannel (F20)
  ///
  /// In ko, this message translates to:
  /// **'전화'**
  String get notifCallChannel;

  /// notifCallDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'수신 전화 알림'**
  String get notifCallDesc;

  /// permContinue (F20)
  ///
  /// In ko, this message translates to:
  /// **'계속'**
  String get permContinue;

  /// permDeniedForever (F20)
  ///
  /// In ko, this message translates to:
  /// **'권한이 영구적으로 거부되었습니다. 설정에서 직접 허용해주세요.'**
  String get permDeniedForever;

  /// permDenied (F20)
  ///
  /// In ko, this message translates to:
  /// **'권한이 거부되었습니다.'**
  String get permDenied;

  /// permOpenSettings (F20)
  ///
  /// In ko, this message translates to:
  /// **'설정으로 이동'**
  String get permOpenSettings;

  /// weekMon (F20)
  ///
  /// In ko, this message translates to:
  /// **'월요일'**
  String get weekMon;

  /// weekTue (F20)
  ///
  /// In ko, this message translates to:
  /// **'화요일'**
  String get weekTue;

  /// weekWed (F20)
  ///
  /// In ko, this message translates to:
  /// **'수요일'**
  String get weekWed;

  /// weekThu (F20)
  ///
  /// In ko, this message translates to:
  /// **'목요일'**
  String get weekThu;

  /// weekFri (F20)
  ///
  /// In ko, this message translates to:
  /// **'금요일'**
  String get weekFri;

  /// weekSat (F20)
  ///
  /// In ko, this message translates to:
  /// **'토요일'**
  String get weekSat;

  /// weekSun (F20)
  ///
  /// In ko, this message translates to:
  /// **'일요일'**
  String get weekSun;

  /// ampmAm (F20)
  ///
  /// In ko, this message translates to:
  /// **'오전'**
  String get ampmAm;

  /// ampmPm (F20)
  ///
  /// In ko, this message translates to:
  /// **'오후'**
  String get ampmPm;

  /// callDeclined (F20)
  ///
  /// In ko, this message translates to:
  /// **'거절된 통화'**
  String get callDeclined;

  /// camUnavailable (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라를 사용할 수 없습니다.'**
  String get camUnavailable;

  /// camNoneFound (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용 가능한 카메라가 없습니다.'**
  String get camNoneFound;

  /// camStartFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'카메라를 시작할 수 없습니다.'**
  String get camStartFail;

  /// camSnapFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'촬영에 실패했습니다.'**
  String get camSnapFail;

  /// camRecStartFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹화를 시작할 수 없습니다.'**
  String get camRecStartFail;

  /// camRecFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹화에 실패했습니다.'**
  String get camRecFail;

  /// camSwitch (F20)
  ///
  /// In ko, this message translates to:
  /// **'전환'**
  String get camSwitch;

  /// camRecTimer (F20)
  ///
  /// In ko, this message translates to:
  /// **'🔴 {elapsed}초 / 최대 {max}초'**
  String camRecTimer(int elapsed, int max);

  /// mediaPlayFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'재생 실패'**
  String get mediaPlayFail;

  /// recMicNeed (F20)
  ///
  /// In ko, this message translates to:
  /// **'마이크 권한이 필요합니다. 설정에서 허용해 주세요.'**
  String get recMicNeed;

  /// recStartFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹음을 시작할 수 없습니다.'**
  String get recStartFail;

  /// recEmpty (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹음된 내용이 없습니다.'**
  String get recEmpty;

  /// recTooLong (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹음이 너무 깁니다. 더 짧게 녹음해 주세요.'**
  String get recTooLong;

  /// recPreviewFail (F20)
  ///
  /// In ko, this message translates to:
  /// **'미리듣기에 실패했습니다.'**
  String get recPreviewFail;

  /// recTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'음성 메시지 녹음'**
  String get recTitle;

  /// recWhile (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹음 중... 중지를 눌러 완료하세요.'**
  String get recWhile;

  /// recPreviewHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'미리듣기로 확인 후 전송하세요.'**
  String get recPreviewHint;

  /// recMaxHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'시작을 누르면 최대 2분까지 녹음됩니다.'**
  String get recMaxHint;

  /// recStop (F20)
  ///
  /// In ko, this message translates to:
  /// **'중지'**
  String get recStop;

  /// recRedo (F20)
  ///
  /// In ko, this message translates to:
  /// **'다시 녹음'**
  String get recRedo;

  /// recPreviewStop (F20)
  ///
  /// In ko, this message translates to:
  /// **'미리듣기 중지'**
  String get recPreviewStop;

  /// recPreview (F20)
  ///
  /// In ko, this message translates to:
  /// **'미리듣기'**
  String get recPreview;

  /// recStart (F20)
  ///
  /// In ko, this message translates to:
  /// **'녹음 시작'**
  String get recStart;

  /// recPlay (F20)
  ///
  /// In ko, this message translates to:
  /// **'재생'**
  String get recPlay;

  /// settingsLanguage (F20)
  ///
  /// In ko, this message translates to:
  /// **'언어'**
  String get settingsLanguage;

  /// settingsLanguageDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'앱 표시 언어'**
  String get settingsLanguageDesc;

  /// dateYmd (F20)
  ///
  /// In ko, this message translates to:
  /// **'{y}년 {m}월 {d}일'**
  String dateYmd(int y, int m, int d);

  /// dateMd (F20)
  ///
  /// In ko, this message translates to:
  /// **'{m}월 {d}일'**
  String dateMd(int m, int d);

  /// timeHm (F20)
  ///
  /// In ko, this message translates to:
  /// **'{period} {h}:{min}'**
  String timeHm(String period, int h, String min);

  /// stripOutboxPending (F20)
  ///
  /// In ko, this message translates to:
  /// **'전송 대기 중 {n}건'**
  String stripOutboxPending(int n);

  /// appCallConnecting (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO {callType} 연결 중'**
  String appCallConnecting(String callType);

  /// verifyCodeHint (F20)
  ///
  /// In ko, this message translates to:
  /// **'{email} 주소로 보내드린 6자리 인증번호를 입력하세요.'**
  String verifyCodeHint(String email);

  /// oaDirectory (F20)
  ///
  /// In ko, this message translates to:
  /// **'인증된 항로 안내소 ({n})'**
  String oaDirectory(int n);

  /// photoCountMeta (F20)
  ///
  /// In ko, this message translates to:
  /// **'사진 {count}장 · {date}'**
  String photoCountMeta(int count, String date);

  /// adminUsersCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'계정 명부 {n}건'**
  String adminUsersCount(int n);

  /// adminReportsCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'안전 신고함 {n}건'**
  String adminReportsCount(int n);

  /// flagUpdatedAt (F20)
  ///
  /// In ko, this message translates to:
  /// **'업데이트: {time}'**
  String flagUpdatedAt(String time);

  /// adminAuditCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'불변 기록부 {n}건'**
  String adminAuditCount(int n);

  /// groupMembersRole (F20)
  ///
  /// In ko, this message translates to:
  /// **'멤버 {n}명 · {role}'**
  String groupMembersRole(int n, String role);

  /// groupMembersParen (F20)
  ///
  /// In ko, this message translates to:
  /// **'멤버 ({n})'**
  String groupMembersParen(int n);

  /// roomInvitesActive (F20)
  ///
  /// In ko, this message translates to:
  /// **'{n}개 활성'**
  String roomInvitesActive(int n);

  /// homeFriendsCount (F20)
  ///
  /// In ko, this message translates to:
  /// **'친구 ({n})'**
  String homeFriendsCount(int n);

  /// reportUserBare (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용자 신고'**
  String get reportUserBare;

  /// reportUserTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'사용자 신고 · {name}'**
  String reportUserTitle(String name);

  /// loungeJoinTitle (F20)
  ///
  /// In ko, this message translates to:
  /// **'{name} 참여'**
  String loungeJoinTitle(String name);

  /// loungeMyNick (F20)
  ///
  /// In ko, this message translates to:
  /// **'내 닉네임: {nick}'**
  String loungeMyNick(String nick);

  /// qrApproveDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'이 기기에서 PC/웹 로그인을 승인합니다.\n요청 ID: {id}'**
  String qrApproveDesc(String id);

  /// qrAddFriendDesc (F20)
  ///
  /// In ko, this message translates to:
  /// **'@{handle}님을 친구로 추가합니다.'**
  String qrAddFriendDesc(String handle);

  /// appUpdateRequired (F20)
  ///
  /// In ko, this message translates to:
  /// **'필수 업데이트가 있습니다 ({v})'**
  String appUpdateRequired(String v);

  /// appUpdateAvailable (F20)
  ///
  /// In ko, this message translates to:
  /// **'새 버전 {v} 사용 가능'**
  String appUpdateAvailable(String v);

  /// appUpToDate (F20)
  ///
  /// In ko, this message translates to:
  /// **'최신 버전입니다 ({v})'**
  String appUpToDate(String v);

  /// settingsLangTh (F20)
  ///
  /// In ko, this message translates to:
  /// **'ไทย (TH)'**
  String get settingsLangTh;

  /// settingsLangJa (F20)
  ///
  /// In ko, this message translates to:
  /// **'日本語 (JA)'**
  String get settingsLangJa;

  /// settingsLangZh (F20)
  ///
  /// In ko, this message translates to:
  /// **'中文 (ZH)'**
  String get settingsLangZh;

  /// msgOfflineSynced (F20)
  ///
  /// In ko, this message translates to:
  /// **'오프라인 메시지 {n}건 동기화 완료'**
  String msgOfflineSynced(int n);

  /// errFileReceive (F20)
  ///
  /// In ko, this message translates to:
  /// **'파일을 받을 수 없습니다 ({code})'**
  String errFileReceive(int code);

  /// msgTopupDone (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO Pay ₩{amount} 충전 완료!'**
  String msgTopupDone(String amount);

  /// msgPayDone10k (F20)
  ///
  /// In ko, this message translates to:
  /// **'LUNO Pay ₩10,000 송금을 완료했습니다.'**
  String get msgPayDone10k;

  /// msgGdprBackup (F20)
  ///
  /// In ko, this message translates to:
  /// **'GDPR 데이터 백업 파일 생성 완료 ({count}개 대화)'**
  String msgGdprBackup(int count);

  /// settingsLangEn (F20)
  ///
  /// In ko, this message translates to:
  /// **'English (EN)'**
  String get settingsLangEn;

  /// settingsLangEs (F20)
  ///
  /// In ko, this message translates to:
  /// **'Español (ES)'**
  String get settingsLangEs;

  /// joinTitle (F21)
  ///
  /// In ko, this message translates to:
  /// **'초대 수락'**
  String get joinTitle;

  /// joinDesc (F21)
  ///
  /// In ko, this message translates to:
  /// **'초대 링크로 그룹 대화방에 참여합니다.'**
  String get joinDesc;

  /// joinConfirm (F21)
  ///
  /// In ko, this message translates to:
  /// **'참여하기'**
  String get joinConfirm;

  /// inviteInvalid (F21)
  ///
  /// In ko, this message translates to:
  /// **'유효하지 않은 초대 링크입니다.'**
  String get inviteInvalid;

  /// inviteExpired (F21)
  ///
  /// In ko, this message translates to:
  /// **'만료된 초대 링크입니다.'**
  String get inviteExpired;

  /// inviteAlreadyIn (F21)
  ///
  /// In ko, this message translates to:
  /// **'이미 참여한 방입니다.'**
  String get inviteAlreadyIn;

  /// shareBannerTitle (F21)
  ///
  /// In ko, this message translates to:
  /// **'공유 도착'**
  String get shareBannerTitle;

  /// shareBannerDesc (F21)
  ///
  /// In ko, this message translates to:
  /// **'방을 선택하면 내용이 입력됩니다.'**
  String get shareBannerDesc;

  /// sharePhotosPreparing (F21)
  ///
  /// In ko, this message translates to:
  /// **'사진 공유는 준비 중입니다.'**
  String get sharePhotosPreparing;

  /// pcAgentReady (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'준비됨'**
  String get pcAgentReady;

  /// pcAgentBusy (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'작업 중'**
  String get pcAgentBusy;

  /// pcAgentOffline (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'오프라인'**
  String get pcAgentOffline;

  /// pcAgentLastSeen (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'마지막 접속 {time}'**
  String pcAgentLastSeen(String time);

  /// pcAgentQueue (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'대기 {count}건'**
  String pcAgentQueue(int count);

  /// pcQuickStatus (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'현재 작업 상태 보고'**
  String get pcQuickStatus;

  /// pcQuickGit (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'git status·브랜치 확인'**
  String get pcQuickGit;

  /// pcQuickCheck (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'정적 분석·빌드 점검'**
  String get pcQuickCheck;

  /// pcQuickContinue (PC agent)
  ///
  /// In ko, this message translates to:
  /// **'Muse Spark 1.3 이어서 진행'**
  String get pcQuickContinue;

  /// No description provided for @walletShortcuts.
  ///
  /// In ko, this message translates to:
  /// **'바로가기'**
  String get walletShortcuts;

  /// No description provided for @walletNoTx.
  ///
  /// In ko, this message translates to:
  /// **'거래 내역이 없습니다.'**
  String get walletNoTx;

  /// callDeclineAction (build 18 real calls)
  ///
  /// In ko, this message translates to:
  /// **'거절'**
  String get callDeclineAction;

  /// callOngoingTitle (build 18 real calls)
  ///
  /// In ko, this message translates to:
  /// **'통화 중'**
  String get callOngoingTitle;

  /// callOngoingBody (build 18 real calls)
  ///
  /// In ko, this message translates to:
  /// **'눌러서 통화 화면으로 돌아가기'**
  String get callOngoingBody;

  /// callAlreadyEnded (build 18 real calls)
  ///
  /// In ko, this message translates to:
  /// **'이미 끝난 통화입니다'**
  String get callAlreadyEnded;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'ja', 'ko', 'th'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'ja':
      return AppLocalizationsJa();
    case 'ko':
      return AppLocalizationsKo();
    case 'th':
      return AppLocalizationsTh();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
