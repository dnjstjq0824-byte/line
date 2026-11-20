// Session state extracted verbatim from the pre-renewal Home widget.
//
// Every API path, payload key and behaviour here is identical to the legacy
// client — only the setState plumbing changed to ChangeNotifier so that
// go_router pages can share one session. No backend contract change.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:package_info_plus/package_info_plus.dart';

import '../api/client.dart';
import '../legacy_tokens.dart';
import '../util/app_notify.dart';
import '../util/app_update.dart';
import '../util/call_media.dart';
import '../util/call_push.dart';
import '../util/album_photos.dart';
import '../util/app_l10n.dart';
import '../util/attachments.dart';
import '../util/channel_slot.dart';
import '../util/feed_posts.dart';
import '../util/official_accounts.dart';
import '../util/photo_effects.dart';
import '../util/profile_photo.dart';
import '../util/poll_options.dart';
import '../util/push_registrar.dart';
import '../util/send_peer.dart';
import '../util/sender_name.dart';
import '../util/store_packs.dart';
import '../util/story_cards.dart';
import '../util/sync_delta.dart';
import '../util/error_report.dart';

/// A-23: reconnect backoff — 2^(attempt-1) seconds capped at 30s, plus up to
/// 1s of jitter so a fleet of clients does not retry in lockstep.
double reconnectDelaySeconds(int attempt, {double Function()? jitter}) {
  final capped = min(pow(2, max(0, attempt - 1)).toDouble(), 30.0);
  return capped + (jitter ?? _defaultJitter)();
}

double _defaultJitter() => Random().nextDouble();

/// A-23: merge a GET .../sync delta page into the cached message list.
/// Dedupes by message id and restores ascending sequence order.
/// Item 3: recalled messages never render — the server keeps the tombstone
/// row (unsent=true, empty body) while clients drop it, matching unsend().
List<dynamic> withoutUnsent(List<dynamic> messages) =>
    messages.where((m) => m['unsent'] != true).toList();

List<dynamic> mergeDeltaMessages(List<dynamic> existing, List<dynamic> delta) {
  final out = List<dynamic>.from(withoutUnsent(existing));
  final seen = <String>{for (final m in out) '${m['id']}'};
  for (final m in delta) {
    if (m['unsent'] == true) {
      out.removeWhere((x) => '${x['id']}' == '${m['id']}');
      seen.remove('${m['id']}');
      continue;
    }
    if (seen.add('${m['id']}')) out.add(m);
  }
  out.sort((a, b) => ((a['sequence'] ?? 0) as num).compareTo((b['sequence'] ?? 0) as num));
  return out;
}

/// Asks for the call permissions with the system dialog (no app context
/// needed, so it also works from the lock-screen ring). Android only.
Future<bool> defaultCallPermissions(bool video) async {
  if (!Platform.isAndroid) return true;
  final wanted = [Permission.microphone, if (video) Permission.camera];
  final statuses = await wanted.request();
  return statuses.values.every((s) => s.isGranted);
}

class SessionController extends ChangeNotifier {
  final Api api;

  SessionController({http.Client? httpClient}) : api = Api(httpClient: httpClient) {
    api.onTokensRefreshed = (access, refresh) async {
      await storage.write(key: 'access_token', value: access);
      if (refresh != null) {
        await storage.write(key: 'refresh_token', value: refresh);
      }
    };
    api.onRefreshFailed = () => logout();
  }

  bool busy = false;
  bool registerMode = false;
  bool showStickerPicker = false;
  bool autoTranslate = false;
  String targetTranslateLang = 'ko'; // validated against translateLanguages
  // T1: translation engine state from GET /api/v1/translate/languages.
  // Empty list + false until the first successful load.
  List<String> translateLanguages = const [];
  bool translateConfigured = false;
  bool _translateLangsLoaded = false;

  String error = '';
  String notice = '';
  // M1: true when startup restore hit a network (or other non-401) error.
  // Tokens are kept and the StatusStrip offers a retry.
  bool offline = false;
  // F20: UI locale (ko/en/th/ja). Korean default preserves every existing
  // notice string; the settings picker persists changes below.
  String locale = 'ko';
  AppLocalizations get strings => stringsFor(locale);
  // F21: text shared into the app waits here until a room is opened,
  // which consumes it into the composer. Images are not held: the app
  // only promises text until the photo pipeline lands.
  String? pendingShareText;
  String consumeShareText() {
    final text = pendingShareText ?? '';
    pendingShareText = null;
    notifyListeners();
    return text;
  }

  void clearPendingShare() {
    pendingShareText = null;
    notifyListeners();
  }

  // F21: inbound platform share (text lands in the next opened room).
  void receiveShare({String? text, bool hasImages = false}) {
    if (hasImages) notice = strings.sharePhotosPreparing;
    if (text != null && text.isNotEmpty) pendingShareText = text;
    notifyListeners();
  }

  Future<void> setLocale(String code) async {
    if (!appLocaleCodes.contains(code) || code == locale) return;
    locale = code;
    api.locale = code;
    try {
      await storage.write(key: 'locale', value: code);
    } catch (_) {}
    notifyListeners();
  }
  String selfId = '';
  String deviceId = '';
  // C3: app-update advisory from /api/v1/app/latest (none until checked).
  UpdateKind appUpdate = UpdateKind.none;
  String currentAppVersion = '';
  String latestAppVersion = '';
  String selfName = '';
  String selfHandle = '';
  String selfStatusMessage = '';
  String selfAvatarUrl = '';
  String selfCoverUrl = '';
  String selfBirthday = '';
  String selfRole = 'user';
  Map<String, dynamic> myPrefs = {};
  bool prefsLoaded = false;

  // null means "not loaded / unavailable" and renders as a dash. A payments
  // surface must never substitute a placeholder figure for a real balance.
  int? walletBalance;
  int? walletPoints;

  List<dynamic> chats = [];
  List<dynamic> friends = [];
  List<dynamic> officialAccounts = [];
  List<dynamic> results = [];
  List<dynamic> messages = [];
  List<dynamic> pins = [];
  List<dynamic> notes = [];
  List<dynamic> events = [];
  List<dynamic> polls = [];
  List<dynamic> albums = [];
  List<dynamic> feedPosts = [];
  List<dynamic> stories = [];
  List<dynamic> openRooms = [];
  String roomId = '';
  String roomNickname = '';
  bool roomJoined = false;
  List<dynamic> roomPosts = [];
  List<dynamic> bookmarks = [];
  List<dynamic> walletHistory = [];
  List<dynamic> newsHero = [];
  List<dynamic> newsPopular = [];
  List<dynamic> callHistory = [];

  // GET /api/v1/news serves LUNO editorial SAMPLE cards, never real press
  // articles. Treated as sample until the server says otherwise.
  bool newsIsSample = true;

  // Smart-channel slot (GET /api/v1/channel/slot). Null hides the card.
  ChannelSlot? channelSlot;
  List<StorePack> storePacks = [];
  final Set<String> dismissedChannelSlots = {};

  void dismissChannelSlot(String id) {
    dismissedChannelSlots.add(id);
    notifyListeners();
  }

  String selectedId = '';
  String selectedTitle = '';
  String replyToId = '';
  String editingMsgId = '';
  // F6: open group room detail (members, roles, notice) + its invite links.
  Map<String, dynamic> selectedRoom = {};
  List<dynamic> roomInvites = [];

  Map<String, dynamic>? activeCall;
  // N1-L: background notifications. notifier is the test seam (fake sink).
  AppNotifier notifier = ProdAppNotifier();
  bool notifyEnabled = true;
  bool isForeground = true;
  Future<void> Function(String route)? notifyTap;
  // Closed-app push (FCM). push is the test seam; pushToken is the token this
  // device last registered (empty when push is off or unsupported).
  PushRegistrar push = ProdPushRegistrar();
  String pushToken = '';
  // Build 18: the phone side of a live call (foreground service, lock
  // screen, proximity, ring cleanup, launch-by-ring). main.dart installs the
  // Android one; tests and other platforms keep the no-op.
  CallSystem callSystem = const NoCallSystem();
  // N2-L: 1:1 call media + state. mediaFactory is the test seam (fake media).
  CallMedia Function() mediaFactory = WebrtcCallMedia.new;
  CallMedia? callMedia;
  bool callMediaIssue = false;
  bool callMuted = false;
  bool callVideoOff = false;
  bool callSpeaker = true;
  int callSeconds = 0;
  Timer? _noAnswerTimer;
  Timer? _callTimer;
  // Signals (offer, ICE) that reach the callee while the call still rings.
  // Opening WebRTC then would put Android in call audio mode, which mutes
  // the ringtone and opens the mic before the user said yes; they are
  // replayed once the call is accepted.
  final List<Map<String, dynamic>> _ringingSignals = [];
  // F15: group call mesh. groupCall holds room_id/title/kind/participants
  // (userBrief maps); one peer CallMedia per remote seat shares the uplink
  // opened on groupLocalMedia. Same joiner-offers rule as the web.
  Map<String, dynamic>? groupCall;
  CallMedia? groupLocalMedia;
  final Map<String, CallMedia> groupPeerMedia = {};
  bool groupMediaIssue = false;
  bool groupMuted = false;
  bool groupVideoOff = false;
  int groupCallSeconds = 0;
  Timer? _groupCallTimer;
  WebSocketChannel? socket;
  StreamSubscription? wsSubscription;
  Timer? reconnectTimer;
  int reconnectAttempt = 0;
  // Heartbeat: a mobile network can drop a socket without closing it, so the
  // app pings every 25 s and reconnects when nothing came back for 70 s.
  Timer? _pingTimer;
  DateTime _lastSocketEvent = DateTime.now();
  static const pingEvery = Duration(seconds: 25);
  static const socketSilenceLimit = Duration(seconds: 70);

  // PC agent: bots in the open room with the presence of their home-PC runner.
  List<Map<String, dynamic>> roomBots = [];
  bool roomBotCommands = false;
  String roomBotsFor = '';

  // Real-time AI Translation Cache
  final Map<String, Map<String, dynamic>> translations = {};

  // Console (existing admin APIs, previously without a Flutter surface).
  Map<String, dynamic>? adminStats;
  List<dynamic> adminUsers = [];
  List<dynamic> adminReports = [];
  List<dynamic> adminAuditLogs = [];
  List<dynamic> featureFlags = [];

  bool get authed => selfId.isNotEmpty;

  void clearStatus() {
    error = '';
    notice = '';
    notifyListeners();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    busy = true;
    error = '';
    notice = '';
    notifyListeners();
    try {
      await action();
    } catch (e) {
      error = e.toString().replaceFirst('Exception: ', '');
      reportError(e);
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> restore() async {
    try {
      final savedLocale = await storage.read(key: 'locale');
      if (savedLocale != null && appLocaleCodes.contains(savedLocale)) {
        locale = savedLocale;
        api.locale = savedLocale;
      }
    } catch (_) {}
    final saved = await storage.read(key: 'access_token');
    if (saved == null) return;
    api.token = saved;
    api.refreshToken = await storage.read(key: 'refresh_token');
    deviceId = await storage.read(key: 'device_id') ?? '';
    try {
      final me = await api.call('/api/v1/me');
      selfId = me['id'] ?? '';
      selfName = me['display_name'] ?? 'LUNO User';
      selfHandle = me['handle'] ?? '';
      selfStatusMessage = me['status_message'] ?? '';
      selfAvatarUrl = me['avatar_url'] ?? '';
      selfCoverUrl = me['cover_url'] ?? '';
      selfBirthday = me['birthday'] ?? '';
      selfRole = me['role'] ?? 'user';
      offline = false;
      error = '';
      notifyListeners();
      await loadPrefs();
      await reload();
      await connect();
      await loadOutbox();
      await flushOutbox();
      unawaited(registerPush());
      unawaited(_pickUpOnLaunch());
    } on ApiException catch (e) {
      if (e.statusCode == 401) {
        // M1: the Api client already spent the refresh token and failed (or
        // there was none to spend), so the grant is dead: log all the way out.
        offline = false;
        await logout();
      } else {
        offline = true;
        error = strings.errTransient;
        notifyListeners();
      }
    } catch (_) {
      // M1: network and unexpected errors keep the stored tokens; the user
      // retries from the offline banner instead of being logged out.
      offline = true;
      error = strings.errNetwork;
      notifyListeners();
    }
  }

  void setRegisterMode(bool value) {
    registerMode = value;
    notifyListeners();
  }

  /// F1: set when the account needs email verification; the login page
  /// swaps to the verify step until [verifyEmail] succeeds.
  bool needsEmailVerify = false;
  String verifyEmail = '';

  Future<void> verifyEmailCode(String code) {
    return run(() async {
      await api.call('/api/v1/auth/verify-email',
          method: 'POST', data: {'email': verifyEmail, 'code': code.trim()});
      needsEmailVerify = false;
      notice = strings.msgEmailVerified;
      notifyListeners();
    });
  }

  Future<void> resendVerifyCode() {
    return run(() async {
      await api.call('/api/v1/auth/verify-email/resend',
          method: 'POST', data: {'email': verifyEmail});
      notice = strings.verifyResentNote;
      notifyListeners();
    });
  }

  /// F24: set when the server demands fresh terms consent (CONSENT_STALE);
  /// the login page swaps to the re-consent step until [submitReconsent].
  bool needsReconsent = false;
  String legalTermsVersion = '';
  String legalPrivacyVersion = '';

  Future<void> loadLegalVersions() async {
    try {
      final v = await api.call('/api/v1/legal');
      legalTermsVersion = '${v['terms_version'] ?? ''}';
      legalPrivacyVersion = '${v['privacy_version'] ?? ''}';
    } catch (_) {
      legalTermsVersion = '';
      legalPrivacyVersion = '';
    }
  }

  Future<void> login({
    required String email,
    required String password,
    required String displayName,
    String birthdate = '',
    bool agreeTerms = false,
    bool agreePrivacy = false,
    bool withConsent = false,
  }) async {
    await run(() async {
      if (registerMode) {
        Map<String, dynamic> reg;
        // The versions load when the login page opens; if that request
        // failed, ticking both boxes would still send empty consent and the
        // server would refuse. Load them now instead.
        if (legalTermsVersion.isEmpty || legalPrivacyVersion.isEmpty) {
          await loadLegalVersions();
        }
        try {
          reg = await api.call('/api/v1/auth/register', method: 'POST', data: {
            'email': email.trim(),
            'password': password,
            'display_name': displayName.trim(),
            'birthdate': birthdate,
            'consent': {
              'terms': agreeTerms ? legalTermsVersion : '',
              'privacy': agreePrivacy ? legalPrivacyVersion : '',
            },
          });
        } on ApiException catch (e) {
          // Build 15: these used to leave no trace, so a refused signup was
          // invisible in telemetry.
          if (e.code == 'CONSENT_REQUIRED' ||
              e.code == 'BIRTHDATE_REQUIRED' ||
              e.code == 'UNDERAGE') {
            reportError(e);
          }
          // F24: consent failures stay on the form with a localized message.
          if (e.code == 'CONSENT_REQUIRED') {
            unawaited(loadLegalVersions());
            error = strings.consentRequiredErr;
            notifyListeners();
            return;
          }
          if (e.code == 'BIRTHDATE_REQUIRED') {
            error = strings.birthdateRequiredErr;
            notifyListeners();
            return;
          }
          if (e.code == 'UNDERAGE') {
            error = strings.underageErr;
            notifyListeners();
            return;
          }
          rethrow;
        }
        registerMode = false;
        if (reg['email_verified'] == false) {
          needsEmailVerify = true;
          verifyEmail = email.trim();
          notice = strings.verifyNeededNote;
          notifyListeners();
          return;
        }
        notice = strings.msgAccountCreated;
        notifyListeners();
        return;
      }
      Map<String, dynamic> result;
      try {
        result = await api.call('/api/v1/auth/login', method: 'POST', data: {
          'email': email.trim(),
          'password': password,
          'platform': 'android',
          'device_name': 'LUNO Android Client',
          if (withConsent)
            'consent': {
              'terms': legalTermsVersion,
              'privacy': legalPrivacyVersion,
            },
        });
      } on ApiException catch (e) {
        if (e.code == 'EMAIL_NOT_VERIFIED') {
          needsEmailVerify = true;
          verifyEmail = email.trim();
          notice = strings.verifyNeededNote;
          notifyListeners();
          return;
        }
        if (e.code == 'CONSENT_STALE') {
          needsReconsent = true;
          await loadLegalVersions();
          notice = strings.consentStaleNote;
          notifyListeners();
          return;
        }
        rethrow;
      }
      needsReconsent = false;
      api.token = result['access_token'];
      api.refreshToken = result['refresh_token'] as String?;
      if (api.refreshToken != null) {
        await storage.write(key: 'refresh_token', value: api.refreshToken!);
      }
      deviceId = result['device_id'] ?? '';
      await storage.write(key: 'access_token', value: api.token);
      await storage.write(key: 'device_id', value: deviceId);
      final me = await api.call('/api/v1/me');
      selfId = me['id'] ?? '';
      selfName = me['display_name'] ?? 'LUNO User';
      selfHandle = me['handle'] ?? '';
      selfStatusMessage = me['status_message'] ?? '';
      selfAvatarUrl = me['avatar_url'] ?? '';
      selfCoverUrl = me['cover_url'] ?? '';
      selfBirthday = me['birthday'] ?? '';
      selfRole = me['role'] ?? 'user';
      if (result['recovered'] == true) notice = strings.accountRecoveredNote;
      notifyListeners();
      await loadPrefs();
      await reload();
      await connect();
      await loadOutbox();
      await flushOutbox();
      unawaited(registerPush());
      unawaited(_pickUpOnLaunch());
    });
  }

  /// F24: retry the login that hit CONSENT_STALE with fresh agreement.
  Future<void> submitReconsent({required String email, required String password}) {
    return login(email: email, password: password, displayName: '', withConsent: true);
  }

  /// F24: surface a form-level error without a round trip (an under-14
  /// birthdate never leaves the device).
  void formError(String message) {
    error = message;
    notifyListeners();
  }

  Future<void> approveDesktopQR(String challengeId, String qrToken) {
    return run(() async {
      await api.call('/api/v1/auth/qr/approve', method: 'POST', data: {
        'challenge_id': challengeId.trim(),
        'qr_token': qrToken.trim(),
      });
      notice = strings.msgQrApproved;
    });
  }

  Future<void> reload() async {
    final resultsList = await Future.wait([
      api.call('/api/v1/conversations').catchError((_) => <String, dynamic>{'conversations': []}),
      api.call('/api/v1/friends').catchError((_) => <String, dynamic>{'friends': []}),
      api.call('/api/v1/official-accounts').catchError((_) => <String, dynamic>{'official_accounts': []}),
      api.call('/api/v1/voom').catchError((_) => <String, dynamic>{'posts': []}),
      api.call('/api/v1/stories').catchError((_) => <String, dynamic>{'stories': []}),
      api.call('/api/v1/community/rooms').catchError((_) => <String, dynamic>{'rooms': []}),
      api.call('/api/v1/wallet').catchError((_) => <String, dynamic>{'history': []}),
      api.call('/api/v1/saved-messages').catchError((_) => <String, dynamic>{'saved_messages': []}),
      api.call('/api/v1/news').catchError((_) => <String, dynamic>{'hero': [], 'popular': [], 'sample': true}),
      api.call('/api/v1/calls').catchError((_) => <String, dynamic>{'calls': []}),
      api.call('/api/v1/channel/slot').catchError((_) => <String, dynamic>{}),
      api.call('/api/v1/store/stickers').catchError((_) => <String, dynamic>{}),
    ]);
    chats = resultsList[0]['conversations'] ?? [];
    friends = resultsList[1]['friends'] ?? [];
    officialAccounts = officialAccountsOf(resultsList[2]);
    feedPosts = feedPostsOf(resultsList[3]);
    stories = storyCardsOf(resultsList[4], locale);
    openRooms = resultsList[5]['rooms'] ?? [];
    walletBalance = (resultsList[6]['balance'] as num?)?.toInt();
    walletPoints = (resultsList[6]['points'] as num?)?.toInt();
    walletHistory = resultsList[6]['history'] ?? [];
    bookmarks = resultsList[7]['saved_messages'] ?? [];
    newsHero = resultsList[8]['hero'] ?? [];
    newsPopular = resultsList[8]['popular'] ?? [];
    newsIsSample = resultsList[8]['sample'] != false;
    callHistory = resultsList[9]['calls'] ?? [];
    channelSlot = channelSlotOf(resultsList[10]);
    storePacks = storePacksOf(resultsList[11]);
    notifyListeners();
  }

  // M2: after a send, refresh only the conversation list (server-ordered, one
  // call) instead of the 12-call full reload(). The sent message itself is
  // already appended by the caller.
  Future<void> refreshChatList() async {
    final res = await api.call('/api/v1/conversations');
    chats = res['conversations'] ?? [];
    notifyListeners();
  }

  Future<void> connect() async {
    reconnectTimer?.cancel();
    reconnectTimer = null;
    _pingTimer?.cancel();
    _pingTimer = null;
    await wsSubscription?.cancel();
    await socket?.sink.close();
    try {
      final ticket = await api.call('/api/v1/ws-ticket', method: 'POST');
      final wsBase = api.baseUrl.startsWith('https:')
          ? api.baseUrl.replaceFirst('https:', 'wss:')
          : api.baseUrl.replaceFirst('http:', 'ws:');
      socket = WebSocketChannel.connect(
        Uri.parse('$wsBase/api/v1/ws?ticket=${Uri.encodeQueryComponent(ticket['ticket'])}'),
      );
      _lastSocketEvent = DateTime.now();
      // The heartbeat starts once the handshake succeeded (a socket that
      // never opens is the reconnect path's job, not the heartbeat's).
      final opened = socket!;
      unawaited(opened.ready.then((_) {
        if (identical(socket, opened)) _startHeartbeat();
      }).catchError((_) {}));
      wsSubscription = socket!.stream.listen((event) {
        _lastSocketEvent = DateTime.now();
        try {
          final data = jsonDecode(event);
          if (data['type'] == 'bot.presence') {
            applyBotPresence(data);
          } else if (data['type'] == 'message.created') {
            applyMessageCreated(data);
            maybeNotifyMessage(data);
          } else if (data['type'] == 'message.updated') {
            if (data['conversation_id'] == selectedId) {
              for (final m in messages) {
                if (m['id'] == data['message_id']) {
                  m['body'] = data['body'];
                  m['edited_at'] = data['edited_at'];
                }
              }
              notifyListeners();
            }
          } else if (data['type'] == 'message.deleted' || data['type'] == 'message.unsent') {
            if (data['conversation_id'] == selectedId) {
              messages.removeWhere((m) => m['id'] == data['message_id']);
              notifyListeners();
            }
          } else if (data['type'] == 'conversation.read') {
            applyConversationRead(data);
          } else if (data['type'] == 'call.ringing') {
            _handleIncomingRing(data);
          } else if (data['type'] == 'call.signal') {
            unawaited(_handleCallSignal(data));
          } else if (data['type'] == 'call.state') {
            _handleCallState(data);
          } else if (data['type'] == 'profile.updated') {
            applyProfileUpdated(data);
          } else if (data['type'] == 'call.group.user_joined') {
            _handleGroupUserJoined(data);
          } else if (data['type'] == 'call.group.user_left') {
            _handleGroupUserLeft(data);
          } else if (data['type'] == 'call.group.signal') {
            unawaited(_handleGroupSignal(data));
          }
        } catch (_) {}
      }, onError: (_) {
        scheduleReconnect();
      }, onDone: scheduleReconnect);
      reconnectAttempt = 0;
      if (notice == strings.msgReconnecting) notice = '';
    } catch (_) {
      scheduleReconnect();
    }
  }

  void _startHeartbeat() {
    _lastSocketEvent = DateTime.now();
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(pingEvery, (_) => heartbeatTick(DateTime.now()));
  }

  /// One heartbeat step (public so tests drive it with a clock): reconnect
  /// when the socket has been silent too long, otherwise send a ping.
  void heartbeatTick(DateTime now) {
    if (!authed || api.token == null) return;
    if (reconnectTimer != null) return; // a reconnect is already scheduled
    if (now.difference(_lastSocketEvent) > socketSilenceLimit) {
      scheduleReconnect();
      return;
    }
    try {
      socket?.sink.add(jsonEncode({'type': 'ping'}));
    } catch (_) {
      scheduleReconnect();
    }
  }

  /// Coming back to the foreground: a socket that died in the background is
  /// replaced at once instead of waiting for the next heartbeat.
  Future<void> resumeConnection() async {
    // Catch up first; then, if the socket did not survive the background,
    // replace it and catch up once more for anything sent in between.
    unawaited(deltaResync());
    if (!authed || api.token == null) return;
    final current = socket;
    final dead = current != null && current.closeCode != null;
    final silent = current != null &&
        DateTime.now().difference(_lastSocketEvent) > socketSilenceLimit;
    if (dead || silent || reconnectTimer != null) {
      reconnectAttempt = 0;
      await connect();
      await deltaResync();
    }
    // Build 18: a ring that went out while the socket was down.
    await pickUpIncomingCall();
    if (roomBotsFor.isNotEmpty) await loadRoomBots(roomBotsFor);
  }

  /// PC agent: bots of one room and whether my commands are allowed there.
  Future<void> loadRoomBots(String roomId) async {
    roomBotsFor = roomId;
    try {
      final res = await api.call('/api/v1/conversations/$roomId/bots');
      if (roomBotsFor != roomId) return; // the user moved to another room
      roomBots = ((res['bots'] as List?) ?? [])
          .whereType<Map>()
          .map((b) => Map<String, dynamic>.from(b))
          .toList();
      roomBotCommands = res['commands_allowed'] == true;
    } catch (_) {
      if (roomBotsFor != roomId) return;
      roomBots = [];
      roomBotCommands = false;
    }
    notifyListeners();
  }

  /// PC agent: a presence push for the open room replaces that bot's row.
  void applyBotPresence(dynamic data) {
    if ('${data['conversation_id']}' != roomBotsFor) return;
    final bot = data['bot'];
    if (bot is! Map) return;
    final next = Map<String, dynamic>.from(bot);
    final at = roomBots.indexWhere((b) => '${b['id']}' == '${next['id']}');
    if (at < 0) return;
    roomBots = [...roomBots]..[at] = next;
    notifyListeners();
  }

  /// A-23: schedule one reconnect attempt with exponential backoff (1s->30s)
  /// plus jitter. Any manual connect()/logout() cancels the pending timer.
  void scheduleReconnect() {
    if (!authed || api.token == null) return;
    reconnectTimer?.cancel();
    reconnectAttempt++;
    final delay = reconnectDelaySeconds(reconnectAttempt);
    notice = strings.msgReconnecting;
    notifyListeners();
    reconnectTimer = Timer(Duration(milliseconds: (delay * 1000).round()), () async {
      await connect();
      await deltaResync();
    });
  }

  /// A-23: after a reconnect, pull only messages sent while offline
  /// (GET .../sync?since_sequence=...) plus ONE conversation-list refresh
  /// for previews/unread — never the 12-call full reload().
  Future<void> deltaResync() async {
    if (selectedId.isNotEmpty) {
      try {
        final since = messages.isEmpty ? 0 : ((messages.last['sequence'] ?? 0) as num).toInt();
        final res = await api.call('/api/v1/conversations/$selectedId/sync?since_sequence=$since');
        messages = mergeDeltaMessages(messages, res['delta_messages'] ?? []);
      } catch (_) {}
    }
    try {
      final res = await api.call('/api/v1/conversations');
      chats = res['conversations'] ?? chats;
    } catch (_) {}
    notifyListeners();
  }

  /// A-23: apply a message.created event in place — append to the open room
  /// and patch exactly one chat-list row (preview + unread, moved to top).
  void applyMessageCreated(dynamic data) {
    final item = data['message'];
    final cid = '${item['conversation_id']}';
    final mine = '${item['sender_id']}' == selfId;
    if (cid == selectedId && !messages.any((m) => m['id'] == item['id'])) {
      messages.add(item);
      if (autoTranslate && !mine && item['kind'] == 'text') {
        translateMessage(item['id'], item['body']);
      }
      // Build 16: the room is open and on screen, so this message is read.
      // Before, read was only posted when the room was opened, so a sender
      // never saw "읽음" for anything that arrived while the peer was in it.
      if (!mine && isForeground) {
        final seq = (item['sequence'] as num?)?.toInt() ?? 0;
        _scheduleRead(cid, seq);
      }
    }
    final idx = chats.indexWhere((c) => '${c['id']}' == cid);
    if (idx >= 0) {
      final row = Map<String, dynamic>.from(chats[idx] as Map);
      row['last_message'] = item;
      final unread = (row['unread_count'] ?? 0) as num;
      row['unread_count'] = cid == selectedId ? 0 : (mine ? unread.toInt() : unread.toInt() + 1);
      chats
        ..removeAt(idx)
        ..insert(0, row);
    }
    notifyListeners();
  }

  // N1-L: notification plumbing. Taps route to the room (calls: the call's
  // room, where the overlay is already live).
  Future<void> initNotifier() async {
    try {
      await notifier.init(
          locale: locale,
          onTap: (payload) async {
        if (payload == null) return;
        if (payload.startsWith('room:')) {
          await notifyTap?.call('/chats/${payload.substring(5)}');
        } else if (payload.startsWith('accept:call:')) {
          // Build 18: Accept on the ring (the app came forward for it).
          final ring = parseRingPayload(payload.substring(7));
          await pickUpIncomingCall(accept: true, callId: ring?.callId ?? '');
        } else if (payload.startsWith('call:')) {
          final ring = parseRingPayload(payload);
          await pickUpIncomingCall(callId: ring?.callId ?? '');
          final cid = activeCall?['conversation_id'];
          await notifyTap?.call(cid != null ? '/chats/$cid' : '/calls');
        }
      });
    } catch (_) {}
  }

  /// Closed-app push: get this device's FCM token and register it with the
  /// server (device-scoped). Never throws; push failing never blocks login.
  Future<void> registerPush() async {
    try {
      final token = await push.start(
        onRefresh: (t) => unawaited(_sendPushToken(t)),
        onOpen: (cid) => unawaited(notifyTap?.call('/chats/$cid') ?? Future<void>.value()),
      );
      if (token != null && token.isNotEmpty) await _sendPushToken(token);
    } catch (_) {}
  }

  Future<void> _sendPushToken(String token) async {
    if (api.token == null) return;
    try {
      await api.call('/api/v1/push-tokens', method: 'POST', data: {
        'token': token,
        'platform': 'android',
        'device_id': deviceId.isEmpty ? 'android' : deviceId,
      });
      pushToken = token;
    } catch (_) {}
  }

  Future<void> _unregisterPush() async {
    if (pushToken.isEmpty) return;
    // Cleared first: a 401 here re-enters logout() via the refresh-failed hook.
    pushToken = '';
    try {
      final id = Uri.encodeQueryComponent(deviceId.isEmpty ? 'android' : deviceId);
      await api.call('/api/v1/push-tokens?device_id=$id', method: 'DELETE');
    } catch (_) {}
    try {
      await push.stop();
    } catch (_) {}
  }

  void setForeground(bool value) {
    final was = isForeground;
    isForeground = value;
    if (value && !was) {
      // Build 18: the in-app call screen rings now; drop the notification
      // ring (its looping ringtone would play on top).
      if (activeCall != null) {
        unawaited(notifier.cancelCall().catchError((_) {}));
      }
      unawaited(resumeConnection());
      // Back on screen with a room open: what arrived meanwhile is now read.
      if (selectedId.isNotEmpty && messages.isNotEmpty) {
        final last = messages.last;
        if (last is Map && '${last['sender_id']}' != selfId) {
          _scheduleRead(selectedId, (last['sequence'] as num?)?.toInt() ?? 0);
        }
      }
    }
  }

  void setNotifyEnabled(bool value) {
    notifyEnabled = value;
    notifyListeners();
  }

  /// Show an OS notification for a background message. No-op in the
  /// foreground, for own messages, or when disabled. Public so tests drive
  /// the same path the socket branch calls.
  void maybeNotifyMessage(Map<String, dynamic> data) {
    if (!notifyEnabled || isForeground) return;
    final item = data['message'];
    if (item == null) return;
    if ('${item['sender_id']}' == selfId) return;
    final cid = '${item['conversation_id']}';
    final chat = chats
        .whereType<Map>()
        .firstWhere((c) => '${c['id']}' == cid, orElse: () => {});
    final title = '${chat['title'] ?? strings.msgNewMessage}';
    final kind = '${item['kind'] ?? 'text'}';
    final rawBody = kind == 'text' ? '${item['body'] ?? ''}' : _notifyKindLabel(kind);
    unawaited(notifier
        .showMessage(
            roomId: cid,
            title: title,
            body: rawBody.isEmpty ? strings.msgNewMessage : rawBody,
            locale: locale)
        .catchError((_) {}));
  }

  String _notifyKindLabel(String kind) {
    return {
      'image': strings.kindPhoto,
      'video': strings.kindVideo,
      'file': strings.kindFile,
      'voice': strings.kindVoice,
      'sticker': strings.kindSticker,
      'location': strings.kindLocation,
      'contact': strings.kindContact,
    }[kind] ??
        strings.kindNewMessage;
  }

  /// A-23: apply a conversation.read event in place — zero one row's unread.
  void applyConversationRead(dynamic data) {
    final cid = '${data['conversation_id']}';
    final reader = '${data['user_id'] ?? ''}';
    // A peer read: light up "읽음" on my messages in the open room now
    // (it used to appear only after leaving and re-entering the room).
    if (reader.isNotEmpty && reader != selfId) {
      if (cid == selectedId) _applyPeerRead(cid, reader, data['sequence']);
      return;
    }
    final idx = chats.indexWhere((c) => '${c['id']}' == cid);
    if (idx >= 0) {
      final row = Map<String, dynamic>.from(chats[idx] as Map);
      row['unread_count'] = 0;
      chats[idx] = row;
      notifyListeners();
    }
  }

  void _applyPeerRead(String cid, String reader, dynamic rawSeq) {
    final seq = (rawSeq as num?)?.toInt() ?? 0;
    if (seq <= 0) return;
    final row = chats.firstWhere((c) => c is Map && '${c['id']}' == cid,
        orElse: () => const <String, dynamic>{});
    final direct = row is Map && '${row['kind'] ?? ''}' == 'direct';
    if (!direct) {
      // Groups count distinct readers; ask the server instead of guessing.
      _scheduleReadCountRefresh(cid);
      return;
    }
    var changed = false;
    for (final m in messages) {
      if (m is! Map || '${m['sender_id']}' != selfId) continue;
      final s = (m['sequence'] as num?)?.toInt() ?? 0;
      if (s > 0 && s <= seq && ((m['read_count'] as num?)?.toInt() ?? 0) < 1) {
        m['read_count'] = 1;
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  /// Build 17: someone changed their name / photo / cover / status. Refetch
  /// the two lists that show people (debounced: a photo + cover save is two
  /// events). Pull-to-refresh is gone, so this is how changes appear live.
  Timer? _peopleTimer;
  void applyProfileUpdated(dynamic data) {
    final who = '${data is Map ? data['user_id'] ?? '' : ''}';
    _peopleTimer?.cancel();
    _peopleTimer = Timer(const Duration(milliseconds: 300), () async {
      try {
        final res = await Future.wait([
          api.call('/api/v1/conversations'),
          api.call('/api/v1/friends'),
          if (who == selfId) api.call('/api/v1/me'),
        ]);
        chats = res[0]['conversations'] ?? chats;
        friends = res[1]['friends'] ?? friends;
        if (res.length > 2) {
          final me = res[2];
          selfAvatarUrl = me['avatar_url'] ?? selfAvatarUrl;
          selfCoverUrl = me['cover_url'] ?? selfCoverUrl;
        }
        notifyListeners();
      } catch (_) {}
    });
  }

  Timer? _readTimer;
  int _pendingReadSeq = 0;
  String _pendingReadCid = '';

  void _scheduleRead(String cid, int seq) {
    if (seq <= 0) return;
    if (_pendingReadCid != cid) _pendingReadSeq = 0;
    _pendingReadCid = cid;
    if (seq > _pendingReadSeq) _pendingReadSeq = seq;
    _readTimer?.cancel();
    _readTimer = Timer(const Duration(milliseconds: 400), () async {
      final s = _pendingReadSeq;
      _pendingReadSeq = 0;
      if (selectedId != cid || !isForeground) return;
      try {
        await api.call('/api/v1/conversations/$cid/read',
            method: 'POST', data: {'sequence': s});
      } catch (_) {}
    });
  }

  Timer? _readCountTimer;
  void _scheduleReadCountRefresh(String cid) {
    _readCountTimer?.cancel();
    _readCountTimer = Timer(const Duration(milliseconds: 600), () async {
      if (selectedId != cid) return;
      try {
        final res = await api.call('/api/v1/conversations/$cid/messages');
        if (selectedId != cid) return;
        final counts = <String, dynamic>{};
        for (final m in List<dynamic>.from(res['messages'] ?? [])) {
          if (m is Map) counts['${m['id']}'] = m['read_count'];
        }
        for (final m in messages) {
          if (m is Map && counts.containsKey('${m['id']}')) {
            m['read_count'] = counts['${m['id']}'];
          }
        }
        notifyListeners();
      } catch (_) {}
    });
  }

  /// The room page left the screen. Forget the selection so new messages
  /// count as unread again, and re-entering reloads and marks read. (The
  /// selection used to stick forever: closeChat had no caller.)
  void closeChatIfOpen(String conversationId) {
    if (selectedId != conversationId) return;
    _readTimer?.cancel();
    _readCountTimer?.cancel();
    closeChat();
  }

  /// Tapped search entities (friend/chat/user), newest first, cap 20.
  /// Client-side only: the server keeps no search history.
  List<Map<String, dynamic>> recentSearches = [];

  void rememberSearch(String kind, String id, String title) {
    recentSearches
        .removeWhere((e) => e['kind'] == kind && e['id'] == id);
    recentSearches.insert(0, {'kind': kind, 'id': id, 'title': title});
    if (recentSearches.length > 20) recentSearches.removeLast();
    notifyListeners();
  }

  void forgetSearch(String kind, String id) {
    recentSearches
        .removeWhere((e) => e['kind'] == kind && e['id'] == id);
    notifyListeners();
  }

  Future<void> find(String query) {
    return run(() async {
      final x = await api.call('/api/v1/users?search=${Uri.encodeQueryComponent(query)}');
      results = x['users'] ?? [];
    });
  }

  Future<void> addFriend(String id) {
    return run(() async {
      await api.call('/api/v1/friends', method: 'POST', data: {'friend_id': id});
      notice = strings.msgFriendAdded;
      await reload();
    });
  }

  Future<void> addFriendByQr(String payload) {
    return run(() async {
      try {
        final res = await api.call('/api/v1/friends',
            method: 'POST', data: {'qr_code': payload.trim()});
        final friend = res['friend'];
        final name = friend is Map ? '${friend['display_name'] ?? ''}' : '';
        if (res['status'] == 'already_friends') {
          notice = name.isEmpty ? strings.msgAlreadyFriend : strings.msgAlreadyFriendName(name);
        } else {
          notice = name.isEmpty ? strings.msgAddedAsFriend : strings.msgAddedNameAsFriend(name);
        }
        await reload();
      } on ApiException catch (e) {
        if (e.statusCode == 404) {
          notice = strings.msgQrUserMissing;
          return;
        }
        if (e.statusCode == 403) {
          notice = strings.msgQrNotAddable;
          return;
        }
        rethrow;
      }
    });
  }
  String titleOf(String conversationId) {
    for (final c in chats) {
      if (c['id'] == conversationId) {
        final title = '${c['title'] ?? ''}';
        return title.isEmpty ? strings.mvChatFallback : title;
      }
    }
    return strings.mvChatFallback;
  }

  // F6: room kind for entry gating (group settings only exist for groups).
  String kindOf(String conversationId) {
    for (final c in chats) {
      if (c['id'] == conversationId) return '${c['kind'] ?? ''}';
    }
    return '';
  }

  /// Item 6: per-message sender label. Group rooms resolve the sender;
  /// direct rooms keep the (nickname-aware) room title.
  String senderLabel(String conversationId, dynamic message) {
    Map<String, dynamic>? room;
    for (final c in chats) {
      if (c is Map && '${c['id']}' == conversationId) {
        room = Map<String, dynamic>.from(c);
        break;
      }
    }
    if (room == null || '${room['kind']}' != 'group') {
      return selectedTitle.isEmpty ? titleOf(conversationId) : selectedTitle;
    }
    final rawMembers = room['members'];
    final members =
        rawMembers is List ? List<dynamic>.from(rawMembers) : <dynamic>[];
    return senderNameOf(message, members);
  }

  Future<void> openChat(String id, [String? title]) async {
    // Never show the previous room's messages under the new room's name.
    if (selectedId != id) {
      messages = [];
      pins = [];
      notes = [];
      events = [];
      polls = [];
      albums = [];
      proposals = [];
    }
    selectedId = id;
    selectedTitle = title ?? titleOf(id);
    notifyListeners();
    // run() drops calls while another action is in flight; opening a room
    // must not be dropped, so wait (bounded) for that action to finish.
    for (var i = 0; i < 100 && busy; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    if (selectedId != id) return; // the user already moved on
    return run(() => _loadRoomData(id, title));
  }

  /// Loads one room's messages and side data. Callers already inside run()
  /// (approve, pay) use this directly; run() would drop a nested call.
  Future<void> _loadRoomData(String id, [String? title]) async {
      selectedId = id;
      selectedTitle = title ?? titleOf(id);
      replyToId = '';
      editingMsgId = '';
      notifyListeners();
      final resultsList = await Future.wait([
        api.call('/api/v1/conversations/$id/messages'),
        api.call('/api/v1/conversations/$id/pins').catchError((_) => <String, dynamic>{'pins': []}),
        api.call('/api/v1/conversations/$id/notes').catchError((_) => <String, dynamic>{'notes': []}),
        api.call('/api/v1/conversations/$id/events').catchError((_) => <String, dynamic>{'events': []}),
        api.call('/api/v1/conversations/$id/polls').catchError((_) => <String, dynamic>{'polls': []}),
        api.call('/api/v1/conversations/$id/albums').catchError((_) => <String, dynamic>{'albums': []}),
        api.call('/api/v1/conversations/$id/proposals').catchError((_) => <String, dynamic>{'proposals': []}),
      ]);
      messages = withoutUnsent(List<dynamic>.from(resultsList[0]['messages'] ?? []));
      pins = resultsList[1]['pins'] ?? [];
      notes = resultsList[2]['notes'] ?? [];
      events = resultsList[3]['events'] ?? [];
      polls = resultsList[4]['polls'] ?? [];
      albums = resultsList[5]['albums'] ?? [];
      proposals = resultsList[6]['proposals'] ?? [];
      notifyListeners();
      if (messages.isNotEmpty) {
        await api.call('/api/v1/conversations/$id/read',
            method: 'POST', data: {'sequence': messages.last['sequence']});
        await reload();
      }
  }

  void closeChat() {
    selectedId = '';
    selectedTitle = '';
    messages = [];
    replyToId = '';
    editingMsgId = '';
    notifyListeners();
  }

  Future<void> syncOffline() {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final lastSeq = messages.isNotEmpty ? messages.last['sequence'] : 0;
      final x = await api.call('/api/v1/conversations/$selectedId/sync?since_sequence=$lastSeq');
      final list = withoutUnsent(syncDeltaOf(x));
      for (final m in list) {
        if (!messages.any((old) => old['id'] == m['id'])) messages.add(m);
      }
      notice = strings.msgOfflineSynced(list.length);
      await reload();
    });
  }

  /// Returns the new conversation id so the page can navigate to it.
  Future<String?> startChat(String id, String title) async {
    String? conversationId;
    await run(() async {
      final c = await api.call('/api/v1/conversations', method: 'POST', data: {
        'kind': 'direct',
        'member_ids': [id],
        'title': title,
      });
      conversationId = c['id'] as String?;
    });
    return conversationId;
  }

  Future<void> startCall(String kind) => startCallIn(selectedId, kind);

  Future<void> startCallIn(String conversationId, String kind) {
    if (conversationId.isEmpty) return Future.value();
    return run(() async {
      // Media is opportunistic: the call UI and signaling survive without it.
      CallMedia? media;
      try {
        media = mediaFactory();
        await media.open(
            video: kind == 'video', iceServers: await _loadIceServers());
      } catch (_) {
        media = null;
        callMediaIssue = true;
      }
      callMedia = media;
      // Build 19: candidates start the moment the offer is set locally,
      // before the server has given this call an id. They used to be
      // dropped (no handler yet); hold them until the offer is posted.
      final earlyIce = <Map<String, dynamic>>[];
      String? liveCallId;
      if (media != null) {
        media.onIceCandidate((cand) {
          final id = liveCallId;
          if (id == null) {
            earlyIce.add(cand);
          } else {
            unawaited(postCallSignal(id, 'ice-candidate', candidate: jsonEncode(cand)));
          }
        });
      }
      // The speaker button shows callSpeaker; make the route match it (the
      // ringback follows the call route too).
      if (media != null) {
        try {
          await media.setSpeaker(callSpeaker);
        } catch (_) {}
      }
      var offerSdp = '';
      if (media != null) {
        try {
          offerSdp = await media.createOffer();
        } catch (_) {
          callMediaIssue = true;
        }
      }
      final res = await api.call('/api/v1/calls', method: 'POST', data: {
        'conversation_id': conversationId,
        'kind': kind,
        if (offerSdp.isNotEmpty) 'sdp_offer': offerSdp,
      });
      activeCall = {
        ...res,
        'conversation_id': conversationId,
        'direction': 'outgoing',
      };
      final callId = '${activeCall!['id']}';
      if (media != null && offerSdp.isNotEmpty) {
        media.onRemoteStream(() => notifyListeners());
        // Offer first, then the held candidates, so the callee never gets
        // a candidate for an offer it has not seen.
        await postCallSignal(callId, 'offer', sdp: offerSdp);
        for (final cand in earlyIce) {
          await postCallSignal(callId, 'ice-candidate', candidate: jsonEncode(cand));
        }
        earlyIce.clear();
        liveCallId = callId;
      }
      _armNoAnswerTimer(callId, true);
      _keepCallAlive();
      notifyListeners();
    });
  }

  bool _callActing = false;

  /// Shown on the call screen itself (the global error strip is hidden
  /// under the full-screen call UI).
  String callError = '';

  /// Call buttons bypass run(): its global busy gate silently dropped an
  /// accept or hang-up whenever any other action (room load, send) was in
  /// flight — "pressed accept, nothing happened".
  Future<void> _callAction(Future<void> Function() action) async {
    if (_callActing) return;
    _callActing = true;
    callError = '';
    notifyListeners();
    try {
      await action();
    } catch (e) {
      callError = e.toString().replaceFirst('Exception: ', '');
      reportError(e);
    } finally {
      _callActing = false;
      notifyListeners();
    }
  }

  Future<void> acceptCall() {
    final call = activeCall;
    if (call == null) return Future.value();
    return _callAction(() async {
      await _ensureCallMedia(call);
      final callId = '${call['id'] ?? call['call_id']}';
      try {
        await api.call('/api/v1/calls/$callId/state',
            method: 'POST', data: {'state': 'connected'});
      } on ApiException catch (e) {
        // The call is gone (caller hung up first): stop ringing here too.
        if (e.statusCode == 404) {
          _clearCallLocal();
          return;
        }
        rethrow;
      }
      if (activeCall == null) return; // ended while we were connecting
      activeCall = {...call, 'state': 'connected'};
      _cancelNoAnswerTimer();
      _startCallTimer();
      unawaited(notifier.cancelCall().catchError((_) {}));
      _keepCallAlive();
      final held = List<Map<String, dynamic>>.of(_ringingSignals);
      _ringingSignals.clear();
      for (final signal in held) {
        await _handleCallSignal(signal);
      }
      notifyListeners();
    });
  }

  Future<void> declineCall() {
    final call = activeCall;
    if (call == null) return Future.value();
    return _callAction(() async {
      final callId = '${call['id'] ?? call['call_id']}';
      try {
        await api.call('/api/v1/calls/$callId/state',
            method: 'POST', data: {'state': 'declined'});
      } catch (_) {}
      _clearCallLocal();
    });
  }

  Future<void> endCall() {
    if (activeCall == null) return Future.value();
    // Stop the local sound and screen first; the server call is best effort.
    return _callAction(() async {
      final callId = activeCall!['id'] ?? activeCall!['call_id'];
      try {
        await api.call('/api/v1/calls/$callId/state',
            method: 'POST', data: {'state': 'ended', 'end_reason': 'hangup'});
      } catch (_) {
        // The peer already hung up, or the network dropped: clear anyway.
      }
      _clearCallLocal();
    });
  }

  /// Build 18: leaving the app or turning the screen off keeps the call
  /// (N2-L used to hang up here). The foreground service started by
  /// [_keepCallAlive] keeps the mic and camera running off screen.
  void onAppBackgrounded() {}

  /// Build 18: a 1:1 or group call is live: survive off screen, show over
  /// the lock screen, and blank the screen at the ear on the earpiece.
  void _keepCallAlive() {
    final call = activeCall ?? groupCall;
    if (call == null) return;
    final video = '${call['kind'] ?? 'voice'}' == 'video';
    final title = '${call['title'] ?? ''}';
    unawaited(callSystem.startOngoing(video: video, title: title));
    unawaited(callSystem.setLockScreen(true));
    _syncProximity();
  }

  void _syncProximity() {
    final call = activeCall;
    final earpiece = call != null &&
        '${call['kind'] ?? 'voice'}' != 'video' &&
        !callSpeaker;
    unawaited(callSystem.setProximity(earpiece));
  }

  void _releaseCallAlive() {
    if (activeCall != null || groupCall != null) return;
    unawaited(callSystem.stopOngoing());
    unawaited(callSystem.setLockScreen(false));
    unawaited(callSystem.setProximity(false));
  }

  Future<void> _pickUpOnLaunch() async {
    unawaited(callSystem.ensureRingPermission());
    final launch = await callSystem.takeLaunchResponse();
    if (launch != null && launch.startsWith('accept:call:')) {
      final ring = parseRingPayload(launch.substring(7));
      await pickUpIncomingCall(accept: true, callId: ring?.callId ?? '');
    } else {
      await pickUpIncomingCall();
    }
  }

  @visibleForTesting
  Future<void> debugPickUpOnLaunch() => _pickUpOnLaunch();

  bool _pickingUp = false;

  /// Build 18: the app was closed (or its socket down) when the call came:
  /// the push woke the phone, so ask the server for the ring, replay the
  /// offer / ICE that went out meanwhile, and accept right away when the
  /// user already pressed Accept on the ring.
  Future<void> pickUpIncomingCall({bool accept = false, String callId = ''}) async {
    if (api.token == null || selfId.isEmpty || _pickingUp) return;
    final current = activeCall;
    if (current != null) {
      final id = '${current['id'] ?? current['call_id']}';
      if (accept &&
          (callId.isEmpty || callId == id) &&
          current['direction'] == 'incoming' &&
          current['state'] == 'ringing') {
        await acceptCall();
      }
      return;
    }
    if (groupCall != null) return;
    _pickingUp = true;
    try {
      Map<String, dynamic> res;
      try {
        res = await api.call('/api/v1/calls/incoming');
      } catch (_) {
        return;
      }
      final ring = res['call'];
      if (ring is! Map || activeCall != null) {
        if (ring is! Map && (accept || callId.isNotEmpty)) {
          // Pressed the ring of a call that already ended.
          unawaited(notifier.cancelCall().catchError((_) {}));
          if (accept) {
            notice = strings.callAlreadyEnded;
            notifyListeners();
          }
        }
        return;
      }
      final data = Map<String, dynamic>.from(ring);
      final id = '${data['call_id']}';
      _handleIncomingRing(data);
      if ('${activeCall?['id']}' != id) return;
      try {
        final sig = await api.call('/api/v1/calls/$id/signals');
        final heldOffer = _ringingSignals.any((x) => x['signal_type'] == 'offer');
        final seen = _ringingSignals.map((x) => '${x['candidate']}').toSet();
        for (final raw in (sig['signals'] as List?) ?? const []) {
          if (raw is! Map) continue;
          final x = Map<String, dynamic>.from(raw);
          if (x['signal_type'] == 'offer' && heldOffer) continue;
          if (x['signal_type'] == 'ice-candidate' &&
              seen.contains('${x['candidate']}')) {
            continue;
          }
          await _handleCallSignal(x);
        }
      } catch (_) {}
      if (isForeground) unawaited(notifier.cancelCall().catchError((_) {}));
      if (accept) await acceptCall();
    } finally {
      _pickingUp = false;
    }
  }

  Future<void> postCallSignal(String callId, String type,
      {String? sdp, String? candidate}) async {
    try {
      await api.call('/api/v1/calls/$callId/signal', method: 'POST', data: {
        'signal_type': type,
        if (sdp != null) 'sdp': sdp,
        if (candidate != null) 'candidate': candidate,
      });
    } catch (_) {
      // Signaling is best-effort; the state machine survives a dropped trickle.
    }
  }

  // F15: group call mesh. One live call at a time: joining while a 1:1 call
  // runs (or twice) surfaces the busy notice instead of mixing audio.
  Future<void> joinGroupCall(String conversationId, String kind) {
    if (conversationId.isEmpty) return Future.value();
    if (groupCall != null || activeCall != null) {
      notice = strings.mvCallBusy;
      notifyListeners();
      return Future.value();
    }
    return run(() async {
      CallMedia? local;
      try {
        local = mediaFactory();
        await local.open(
            video: kind == 'video', iceServers: await _loadIceServers());
        await local.setMuted(groupMuted);
        await local.setVideoOff(groupVideoOff);
      } catch (_) {
        local = null;
        groupMediaIssue = true;
      }
      groupLocalMedia = local;
      late final Map<String, dynamic> res;
      try {
        res = await api.call('/api/v1/calls/group/join',
            method: 'POST', data: {'room_id': conversationId});
      } on ApiException catch (e) {
        _clearGroupCallLocal();
        notice = e.statusCode == 409
            ? strings.mvGroupCallFull
            : strings.mvGroupCallFailed;
        notifyListeners();
        return;
      } catch (_) {
        _clearGroupCallLocal();
        notice = strings.mvGroupCallFailed;
        notifyListeners();
        return;
      }
      final peers = <Map<String, dynamic>>[];
      for (final p in (res['participants'] as List?) ?? []) {
        if (p is Map && '${p['id']}' != selfId) {
          peers.add(Map<String, dynamic>.from(p));
        }
      }
      groupCall = {
        'room_id': conversationId,
        'title': titleOf(conversationId),
        'kind': kind,
        'participants': peers,
      };
      // Joiner offers to every existing participant (mesh rule, mirrors web).
      for (final peer in peers) {
        await _offerGroupPeer(conversationId, '${peer['id']}');
      }
      _groupCallTimer?.cancel();
      groupCallSeconds = 0;
      _groupCallTimer =
          Timer.periodic(const Duration(seconds: 1), (_) => groupCallSeconds++);
      _keepCallAlive();
      notifyListeners();
    });
  }

  Future<void> _offerGroupPeer(String roomId, String peerId) async {
    final call = groupCall;
    if (call == null || '${call['room_id']}' != roomId) return;
    try {
      var media = groupPeerMedia[peerId];
      if (media == null) {
        media = mediaFactory();
        await media.openPeer(iceServers: await _loadIceServers());
        final uplink = groupLocalMedia?.localStream;
        if (uplink != null) await media.setLocalStream(uplink);
        media.onIceCandidate((cand) =>
            unawaited(postGroupSignal(roomId, peerId, {'type': 'ice-candidate', 'candidate': cand})));
        media.onRemoteStream(() => notifyListeners());
        groupPeerMedia[peerId] = media;
      }
      final offer = await media.createOffer();
      await postGroupSignal(roomId, peerId, {'type': 'offer', 'sdp': offer});
    } catch (_) {}
  }

  Future<void> postGroupSignal(
      String roomId, String peerId, Map<String, dynamic> signal) async {
    try {
      await api.call('/api/v1/calls/group/signal', method: 'POST', data: {
        'room_id': roomId,
        'target_user_id': peerId,
        'signal': signal,
      });
    } catch (_) {
      // Signaling is best-effort; the state machine survives a dropped trickle.
    }
  }

  Future<void> leaveGroupCall() {
    if (groupCall == null) return Future.value();
    return run(() async {
      final roomId = '${groupCall!['room_id']}';
      _clearGroupCallLocal();
      try {
        await api.call('/api/v1/calls/group/leave',
            method: 'POST', data: {'room_id': roomId});
      } catch (_) {}
    });
  }

  void _clearGroupCallLocal() {
    _groupCallTimer?.cancel();
    _groupCallTimer = null;
    for (final media in groupPeerMedia.values) {
      unawaited(media.dispose().catchError((_) {}));
    }
    groupPeerMedia.clear();
    final local = groupLocalMedia;
    groupLocalMedia = null;
    if (local != null) unawaited(local.dispose().catchError((_) {}));
    groupCall = null;
    groupMediaIssue = false;
    groupCallSeconds = 0;
    _releaseCallAlive();
    notifyListeners();
  }

  Future<void> setGroupMuted(bool muted) async {
    groupMuted = muted;
    try {
      await groupLocalMedia?.setMuted(muted);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> setGroupVideoOff(bool off) async {
    groupVideoOff = off;
    try {
      await groupLocalMedia?.setVideoOff(off);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> switchGroupCamera() async {
    try {
      await groupLocalMedia?.switchCamera();
    } catch (_) {}
  }

  Future<void> setGroupSpeaker(bool on) async {
    callSpeaker = on;
    try {
      await groupLocalMedia?.setSpeaker(on);
    } catch (_) {}
    notifyListeners();
  }

  @visibleForTesting
  void debugGroupJoined(Map<String, dynamic> data) =>
      _handleGroupUserJoined(data);

  @visibleForTesting
  void debugGroupLeft(Map<String, dynamic> data) => _handleGroupUserLeft(data);

  @visibleForTesting
  Future<void> debugGroupSignal(Map<String, dynamic> data) =>
      _handleGroupSignal(data);

  void _handleGroupUserJoined(Map<String, dynamic> data) {
    final call = groupCall;
    if (call == null || '${data['room_id']}' != '${call['room_id']}') return;
    final peerId = '${data['user_id']}';
    if (peerId.isEmpty || peerId == selfId) return;
    final peers = List<Map<String, dynamic>>.from(call['participants'] ?? []);
    if (peers.any((p) => '${p['id']}' == peerId)) return;
    // Existing seats only add the tile; the joiner sends us the offer.
    peers.add({'id': peerId, 'display_name': data['user_name'] ?? peerId});
    groupCall = {...call, 'participants': peers};
    notifyListeners();
  }

  void _handleGroupUserLeft(Map<String, dynamic> data) {
    final call = groupCall;
    if (call == null || '${data['room_id']}' != '${call['room_id']}') return;
    final peerId = '${data['user_id']}';
    final media = groupPeerMedia.remove(peerId);
    if (media != null) unawaited(media.dispose().catchError((_) {}));
    final peers = List<Map<String, dynamic>>.from(call['participants'] ?? [])
        .where((p) => '${p['id']}' != peerId)
        .toList();
    groupCall = {...call, 'participants': peers};
    notifyListeners();
  }

  Future<void> _handleGroupSignal(Map<String, dynamic> data) async {
    final call = groupCall;
    if (call == null || '${data['room_id']}' != '${call['room_id']}') return;
    final fromId = '${data['from_user_id']}';
    if (fromId.isEmpty || fromId == selfId) return;
    final signal =
        data['signal'] is Map ? Map<String, dynamic>.from(data['signal']) : {};
    try {
      var media = groupPeerMedia[fromId];
      if (media == null) {
        // Answer-side PC, built lazily to survive event reordering.
        media = mediaFactory();
        await media.openPeer(iceServers: await _loadIceServers());
        final uplink = groupLocalMedia?.localStream;
        if (uplink != null) await media.setLocalStream(uplink);
        final roomId = '${call['room_id']}';
        media.onIceCandidate((cand) =>
            unawaited(postGroupSignal(roomId, fromId, {'type': 'ice-candidate', 'candidate': cand})));
        media.onRemoteStream(() => notifyListeners());
        groupPeerMedia[fromId] = media;
      }
      final roomId = '${call['room_id']}';
      if (signal['type'] == 'offer' && signal['sdp'] is String) {
        final answer = await media.answerTo(signal['sdp'] as String);
        await postGroupSignal(roomId, fromId, {'type': 'answer', 'sdp': answer});
      } else if (signal['type'] == 'answer' && signal['sdp'] is String) {
        await media.applyAnswer(signal['sdp'] as String);
      } else if (signal['type'] == 'ice-candidate' && signal['candidate'] is Map) {
        await media
            .addIceCandidate(Map<String, dynamic>.from(signal['candidate']));
      }
    } catch (_) {}
  }

  Future<void> setCallMuted(bool muted) async {
    callMuted = muted;
    try {
      await callMedia?.setMuted(muted);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> setCallVideoOff(bool off) async {
    callVideoOff = off;
    try {
      await callMedia?.setVideoOff(off);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> switchCallCamera() async {
    try {
      await callMedia?.switchCamera();
    } catch (_) {}
  }

  Future<void> setCallSpeaker(bool on) async {
    callSpeaker = on;
    try {
      await callMedia?.setSpeaker(on);
    } catch (_) {}
    _syncProximity();
    notifyListeners();
  }

  Future<List<Map<String, dynamic>>> _loadIceServers() async {
    try {
      final res = await api.call('/api/v1/calls/ice-servers');
      final servers = res['ice_servers'];
      if (servers is List && servers.isNotEmpty) {
        return servers
            .whereType<Map>()
            .map((s) => Map<String, dynamic>.from(s))
            .toList();
      }
    } catch (_) {}
    return const [
      {'urls': 'stun:stun.l.google.com:19302'}
    ];
  }

  /// Build 19: mic (and camera) before media opens. The lock-screen Accept
  /// skipped the call screen's permission gate, so a phone that never
  /// granted the mic connected silent. Tests replace it.
  Future<bool> Function(bool video) ensureCallPermissions = defaultCallPermissions;

  Future<void> _ensureCallMedia(Map<String, dynamic> call) async {
    if (callMedia != null) return;
    try {
      await ensureCallPermissions(call['kind'] == 'video');
    } catch (_) {}
    try {
      final media = mediaFactory();
      await media.open(
          video: call['kind'] == 'video', iceServers: await _loadIceServers());
      final callId = '${call['id'] ?? call['call_id']}';
      media.onIceCandidate((cand) => unawaited(
          postCallSignal(callId, 'ice-candidate', candidate: jsonEncode(cand))));
      media.onRemoteStream(() => notifyListeners());
      callMedia = media;
      try {
        await media.setSpeaker(callSpeaker);
      } catch (_) {}
    } catch (_) {
      callMediaIssue = true;
    }
  }

  // Test-only entry points into the WS call branches (they delegate to the
  // real private handlers, so behavior cannot drift from production).
  @visibleForTesting
  void debugIncomingRing(Map<String, dynamic> data) =>
      _handleIncomingRing(data);

  @visibleForTesting
  Future<void> debugCallSignal(Map<String, dynamic> data) =>
      _handleCallSignal(data);

  @visibleForTesting
  void debugCallState(Map<String, dynamic> data) => _handleCallState(data);

  void _handleIncomingRing(Map<String, dynamic> data) {
    final incomingId = '${data['call_id']}';
    final currentId =
        activeCall == null ? null : '${activeCall!['id'] ?? activeCall!['call_id']}';
    // Own echo (broadcast reaches the caller too) or a duplicate ring.
    if (data['initiated_by'] == selfId || currentId == incomingId) return;
    // F15: a live group call is a busy line for incoming 1:1 rings.
    if (currentId != null || groupCall != null) {
      // Busy on another call: auto-decline, keep the current one.
      unawaited(api.call('/api/v1/calls/$incomingId/state',
          method: 'POST',
          data: {'state': 'declined'}).then((_) {
        notice = strings.mvCallBusy;
        notifyListeners();
      }).catchError((_) {}));
      return;
    }
    final callerTitle =
        '${data['caller_name'] ?? data['caller_handle'] ?? strings.callIncomingTitle}';
    final callKind = '${data['kind'] ?? 'voice'}';
    activeCall = {
      'id': incomingId,
      'call_id': incomingId,
      'conversation_id': data['conversation_id'],
      'kind': callKind,
      'state': 'ringing',
      'direction': 'incoming',
      'title': callerTitle,
      if (data['ring_token'] != null) 'ring_token': '${data['ring_token']}',
    };
    // Build 18: the ring may have to show over the lock screen.
    unawaited(callSystem.setLockScreen(true));
    if (notifyEnabled && !isForeground) {
      unawaited(notifier
          .showIncomingCall(
              callId: incomingId,
              title: callerTitle,
              body: callKind == 'video' ? strings.mvIncomingVideo : strings.mvIncomingVoice,
              locale: locale,
              kind: callKind,
              ringToken: '${data['ring_token'] ?? ''}')
          .catchError((_) {}));
    }
    _armNoAnswerTimer(incomingId, false);
    notifyListeners();
  }

  Future<void> _handleCallSignal(Map<String, dynamic> data) async {
    final call = activeCall;
    if (call == null) return;
    if (data['from_user_id'] == selfId) return;
    final callId = '${call['id'] ?? call['call_id']}';
    if (data['call_id'] != null && '${data['call_id']}' != callId) return;
    if (call['direction'] == 'incoming' &&
        '${call['state'] ?? 'ringing'}' == 'ringing') {
      _ringingSignals.add(data);
      return;
    }
    await _ensureCallMedia(call);
    final media = callMedia;
    if (media == null) return;
    try {
      final type = data['signal_type'];
      if (type == 'offer' && data['sdp'] is String) {
        final answer = await media.answerTo(data['sdp'] as String);
        await postCallSignal(callId, 'answer', sdp: answer);
      } else if (type == 'answer' && data['sdp'] is String) {
        await media.applyAnswer(data['sdp'] as String);
      } else if (type == 'ice-candidate' && data['candidate'] != null) {
        final raw = data['candidate'];
        final decoded = raw is String ? jsonDecode(raw) : raw;
        if (decoded is Map) {
          await media.addIceCandidate(Map<String, dynamic>.from(decoded));
        }
      }
    } catch (_) {
      callMediaIssue = true;
      notifyListeners();
    }
  }

  void _handleCallState(Map<String, dynamic> data) {
    final call = activeCall;
    if (call == null) return;
    final callId = '${call['id'] ?? call['call_id']}';
    if (data['call_id'] != null && '${data['call_id']}' != callId) return;
    if (data['state'] == 'ended') {
      _clearCallLocal();
    } else if (data['state'] == 'connected') {
      activeCall = {...call, 'state': 'connected'};
      _cancelNoAnswerTimer();
      _startCallTimer();
      notifyListeners();
    }
  }

  void _armNoAnswerTimer(String callId, bool caller) {
    _cancelNoAnswerTimer();
    _noAnswerTimer = Timer(callNoAnswerTimeout, () {
      _noAnswerTimer = null;
      final call = activeCall;
      if (call == null) return;
      if ('${call['id'] ?? call['call_id']}' != callId) return;
      if (call['state'] != 'ringing') return;
      // Caller hangs up their own unanswered invite; the callee records
      // the unanswered ring as missed. Mirrors the web's noAnswerState.
      unawaited(api.call('/api/v1/calls/$callId/state',
          method: 'POST',
          data: {'state': caller ? 'ended' : 'missed'}).then((_) {
        _clearCallLocal();
      }).catchError((_) {
        _clearCallLocal();
      }));
    });
  }

  void _cancelNoAnswerTimer() {
    _noAnswerTimer?.cancel();
    _noAnswerTimer = null;
  }

  void _startCallTimer() {
    _callTimer?.cancel();
    callSeconds = 0;
    _callTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      callSeconds++;
      notifyListeners();
    });
  }

  void _clearCallLocal() {
    _ringingSignals.clear();
    _cancelNoAnswerTimer();
    _callTimer?.cancel();
    _callTimer = null;
    unawaited(notifier.cancelCall().catchError((_) {}));
    final media = callMedia;
    callMedia = null;
    if (media != null) unawaited(media.dispose().catchError((_) {}));
    activeCall = null;
    callMediaIssue = false;
    callError = '';
    callSeconds = 0;
    _releaseCallAlive();
    notifyListeners();
  }

  // F10: offline outbox. Network failures queue the message (persisted,
  // owner-scoped) instead of losing it; the same client_id dedups the
  // retry server-side. Server rejections (ApiException) are real errors
  // and surface instead of queueing.
  List<Map<String, dynamic>> outbox = [];

  Future<void> _saveOutbox() async {
    try {
      await storage.write(key: 'pending_outbox', value: jsonEncode(outbox));
    } catch (_) {}
  }

  Future<void> loadOutbox() async {
    try {
      final raw = await storage.read(key: 'pending_outbox');
      if (raw == null || raw.isEmpty) {
        outbox = [];
        return;
      }
      final list = (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .where((m) => '${m['owner_id'] ?? ''}' == selfId)
          .toList();
      outbox = list;
      notifyListeners();
    } catch (_) {}
  }

  /// Flushes my queued messages in order. Stops at the first network
  /// failure (the rest stay queued); drops server rejections after one
  /// honest attempt so a poison message cannot wedge the queue.
  Future<void> flushOutbox() async {
    if (outbox.isEmpty || selfId.isEmpty) return;
    var sent = 0;
    var dropped = 0;
    while (outbox.isNotEmpty) {
      final item = outbox.first;
      if ('${item['owner_id'] ?? ''}' != selfId) {
        outbox.removeAt(0);
        continue;
      }
      try {
        final x = await api.call(
            '/api/v1/conversations/${item['conversation_id']}/messages',
            method: 'POST',
            data: {
              'client_id': '${item['client_id']}',
              'kind': '${item['kind'] ?? 'text'}',
              'body': '${item['body'] ?? ''}',
              if ('${item['reply_to'] ?? ''}'.isNotEmpty)
                'reply_to': '${item['reply_to']}',
              if (item['metadata'] is Map) 'metadata': item['metadata'],
            });
        outbox.removeAt(0);
        sent++;
        final mid = x['message']?['id'];
        if ('${item['conversation_id']}' == selectedId &&
            mid != null &&
            !messages.any((m) => m['id'] == mid)) {
          messages.add(x['message']);
        }
      } on ApiException {
        outbox.removeAt(0);
        dropped++;
      } catch (_) {
        break;
      }
    }
    await _saveOutbox();
    if (sent > 0) {
      notice = strings.msgOutboxSent(sent);
      await refreshChatList();
    } else if (dropped > 0) {
      error = strings.errOutboxDropped(dropped);
    }
    notifyListeners();
  }

  /// True when the text is safe (sent or queued) and the composer may
  /// clear; false when nothing was kept (empty input, rejection, no room).
  Future<bool> send(
      {String kind = 'text', String? customBody, String text = '', Map<String, dynamic>? metadata}) async {
    if (selectedId.isEmpty) return false;
    final body = customBody ?? text.trim();
    if (body.isEmpty) return false;

    if (editingMsgId.isNotEmpty && customBody == null) {
      final targetId = editingMsgId;
      editingMsgId = '';
      notifyListeners();
      await run(() async {
        await api.call('/api/v1/conversations/$selectedId/messages/$targetId',
            method: 'PATCH', data: {'body': body});
        for (final m in messages) {
          if (m['id'] == targetId) m['body'] = body;
        }
        notice = strings.msgEdited;
      });
      return error.isEmpty;
    }

    final reply = replyToId;
    replyToId = '';
    showStickerPicker = false;
    notifyListeners();
    final clientId = uuid();
    var kept = false;
    await run(() async {
      try {
        final x = await api.call('/api/v1/conversations/$selectedId/messages',
            method: 'POST', data: {
          'client_id': clientId,
          'kind': kind,
          'body': body,
          if (reply.isNotEmpty) 'reply_to': reply,
          if (metadata != null) 'metadata': metadata,
        });
        if (!messages.any((m) => m['id'] == x['message']['id'])) {
          messages.add(x['message']);
        }
        kept = true;
        await refreshChatList();
        await flushOutbox();
      } on ApiException {
        rethrow;
      } catch (_) {
        outbox.add({
          'owner_id': selfId,
          'conversation_id': selectedId,
          'client_id': clientId,
          'kind': kind,
          'body': body,
          if (reply.isNotEmpty) 'reply_to': reply,
          if (metadata != null) 'metadata': metadata,
        });
        await _saveOutbox();
        notice = strings.msgQueuedOffline;
        kept = true;
      }
    });
    return kept;
  }

  Future<PickedImage?> pickChatImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
        source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 85);
    if (picked == null) return null;
    final bytes = await picked.readAsBytes();
    if (bytes.length > maxAttachmentBytes) {
      throw Exception(strings.errFileTooBig);
    }
    return PickedImage(
        bytes: bytes, name: picked.name, mime: picked.mimeType ?? 'image/jpeg');
  }

  Future<void> sendPickedImage(PickedImage pic, {String effect = 'none'}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final bytes = applyPhotoEffect(pic.bytes, effect);
      if (bytes.length > maxAttachmentBytes) {
        throw Exception(strings.errFileTooBig);
      }
      // applyPhotoEffect returns the identical bytes when nothing applied.
      final effected = !identical(bytes, pic.bytes);
      final mime = effected ? 'image/jpeg' : pic.mime;
      final name = effected ? photoEffectName(pic.name, effect) : pic.name;
      final att = await api.call('/api/v1/attachments', method: 'POST', data: {
        'conversation_id': selectedId,
        'original_name': name,
        'mime_type': mime,
        'size_bytes': bytes.length,
        'content_base64': base64Encode(bytes),
      });
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': attachmentKindForMime(mime),
        'body': att['original_name'] ?? name,
        'metadata': attachmentMessageMetadata(
            id: att['id'], mime: mime, size: bytes.length),
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      await refreshChatList();
    });
  }

  Future<void> sendVoice(Uint8List bytes,
      {required int durationSec,
      String mime = 'audio/mp4',
      String name = 'voice-note.m4a'}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      if (bytes.length > maxAttachmentBytes) {
        throw Exception(strings.errFileTooBig);
      }
      final att = await api.call('/api/v1/attachments', method: 'POST', data: {
        'conversation_id': selectedId,
        'original_name': name,
        'mime_type': mime,
        'size_bytes': bytes.length,
        'content_base64': base64Encode(bytes),
      });
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': 'voice',
        'body': att['original_name'] ?? name,
        'metadata': voiceMessageMetadata(
            id: att['id'], mime: mime, size: bytes.length, durationSec: durationSec),
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      await refreshChatList();
    });
  }

  // F9: location + contact messages. Coordinates are validated by the
  // server; contacts share a friend's id/handle/display name.
  Future<void> sendLocation(
      {required double lat, required double lng, String label = ''}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': 'location',
        'body': label.trim(),
        'metadata': {'lat': lat, 'lng': lng, 'label': label.trim()},
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      notice = strings.msgLocationShared;
      await refreshChatList();
    });
  }

  Future<void> sendContact(Map<String, dynamic> friend) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': 'contact',
        'body': '${friend['display_name'] ?? ''}',
        'metadata': {
          'user_id': '${friend['id']}',
          'handle': '${friend['handle'] ?? ''}',
          'display_name': '${friend['display_name'] ?? ''}',
        },
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      notice = strings.msgContactShared;
      await refreshChatList();
    });
  }

  // T1: load the server's translation language list once. Silent on any
  // failure: translating must degrade to the "preparing" notice, never crash.
  Future<void> ensureTranslateLanguages() async {
    if (_translateLangsLoaded) return;
    _translateLangsLoaded = true;
    try {
      final res = await api.call('/api/v1/translate/languages');
      final langs = res['languages'];
      if (res['configured'] == true && langs is List) {
        translateLanguages =
            langs.whereType<String>().map((l) => l.toLowerCase()).toList();
        translateConfigured = translateLanguages.isNotEmpty;
        if (translateConfigured &&
            !translateLanguages.contains(targetTranslateLang)) {
          targetTranslateLang = translateLanguages.first;
        }
      }
    } catch (_) {
      translateConfigured = false;
    }
    notifyListeners();
  }

  Future<void> translateMessage(String msgId, String text) async {
    if (translations.containsKey(msgId)) {
      translations.remove(msgId);
      notifyListeners();
      return;
    }
    await ensureTranslateLanguages();
    if (!translateConfigured) {
      translations[msgId] = {'loading': false, 'error': strings.translatePreparing};
      notifyListeners();
      return;
    }
    translations[msgId] = {'loading': true};
    notifyListeners();
    try {
      final res = await api.call('/api/v1/translate', method: 'POST', data: {
        'text': text,
        'target_lang': targetTranslateLang,
      });
      translations[msgId] = {
        'loading': false,
        'translated': res['translated'] ?? text,
        'target_lang': res['target_lang'] ?? targetTranslateLang,
        'engine': res['engine'] ?? 'LUNO-Edge-AI',
      };
    } on ApiException catch (e) {
      translations[msgId] = {
        'loading': false,
        'error': e.statusCode == 503 ? strings.translatePreparing : strings.errTranslateFailed
      };
    } catch (_) {
      translations[msgId] = {'loading': false, 'error': strings.errTranslateFailed};
    }
    notifyListeners();
  }

  Future<void> unsend(String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId', method: 'DELETE');
      messages.removeWhere((m) => m['id'] == msgId);
      notice = strings.msgSendCancelled;
    });
  }

  Future<void> react(String msgId, String emoji) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId/reactions',
          method: 'POST', data: {'reaction': emoji});
      notice = strings.msgReactionLeft(emoji);
    });
  }

  /// L-05: approval box. Proposals of the open room with decision states.
  List<dynamic> proposals = [];

  String proposalState(String messageId) {
    for (final p in proposals) {
      if (p is Map && '${p['message_id']}' == messageId) {
        return '${p['state'] ?? 'pending'}';
      }
    }
    return 'pending';
  }

  /// Approvers mirror the server rule: room owner, global admin, or -- in
  /// direct rooms with no owner -- any member.
  bool canDecideIn(Map<String, dynamic>? room) {
    if (room == null) return false;
    if (selfRole == 'admin') return true;
    if ('${room['kind']}' == 'direct') return true;
    // F6: group admins decide alongside the owner (my_role rides the
    // chats list entries, so no extra fetch is needed).
    if ('${room['my_role'] ?? ''}' == 'admin') return true;
    return '${room['owner_id'] ?? ''}' == selfId && selfId.isNotEmpty;
  }

  Future<void> loadProposals(String roomId) async {
    try {
      final res = await api.call('/api/v1/conversations/$roomId/proposals');
      proposals = (res['proposals'] as List?) ?? [];
    } catch (_) {
      proposals = [];
    }
    notifyListeners();
  }

  /// F4: user reports. History of my own filings with states.
  List<dynamic> myReports = [];

  Future<void> reportUser(String userId, String category, String details) {
    return run(() async {
      await api.call('/api/v1/reports',
          method: 'POST',
          data: {
            'subject_user_id': userId,
            'category': category,
            'details': details
          });
      notice = strings.reportDoneNote;
      await loadMyReports();
    });
  }

  Future<void> loadMyReports() async {
    try {
      final res = await api.call('/api/v1/reports/mine');
      myReports = (res['reports'] as List?) ?? [];
    } catch (_) {
      myReports = [];
    }
    notifyListeners();
  }

  /// F30: customer support tickets. My filings with admin answers.
  List<dynamic> supportTickets = [];

  Future<void> loadSupportTickets() async {
    try {
      final res = await api.call('/api/v1/support/tickets');
      supportTickets = (res['tickets'] as List?) ?? [];
    } catch (_) {
      supportTickets = [];
    }
    notifyListeners();
  }

  Future<void> fileSupportTicket(String category, String body) {
    return run(() async {
      await api.call('/api/v1/support/tickets', method: 'POST', data: {
        'category': category,
        'body': body,
        'app_version': currentAppVersion,
        'device_info': 'LUNO Android Client',
      });
      notice = strings.supportDoneNote;
      await loadSupportTickets();
    });
  }

  /// F26: contact discovery. Consent gates uploads; a 503 marks the
  /// server feature off (guidance only, never a retry loop).
  bool contactConsent = false;
  bool contactConsentLoaded = false;
  List<dynamic> contactMatches = [];
  bool contactUnavailable = false;

  Future<void> loadContactConsent() async {
    try {
      final res = await api.call('/api/v1/contacts/consent');
      contactConsent = res['consented'] == true;
    } catch (_) {
      contactConsent = false;
    }
    contactConsentLoaded = true;
    notifyListeners();
  }

  Future<void> setContactConsent(bool v) {
    return run(() async {
      final res = await api.call('/api/v1/contacts/consent',
          method: 'POST', data: {'consented': v});
      contactConsent = res['consented'] == true;
      contactConsentLoaded = true;
    });
  }

  Future<void> findContacts(List<String> phones) {
    return run(() async {
      contactUnavailable = false;
      try {
        final res = await api.call('/api/v1/contacts/match',
            method: 'POST', data: {'phones': phones});
        contactMatches = (res['matches'] as List?) ?? [];
      } on ApiException catch (e) {
        if (e.statusCode == 503) {
          contactMatches = [];
          contactUnavailable = true;
          return;
        }
        rethrow;
      }
    });
  }

  Future<void> decideProposal(
      String roomId, String messageId, String decision) {
    return run(() async {
      await api.call(
          '/api/v1/conversations/$roomId/messages/$messageId/decide',
          method: 'POST',
          data: {'decision': decision});
      notice = decision == 'approved' ? strings.msgApproved : strings.msgDeclined;
      await loadProposals(roomId);
      await _loadRoomData(roomId);
    });
  }

  Future<void> pin(String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/pins',
          method: 'POST', data: {'message_id': msgId});
      final p = await api.call('/api/v1/conversations/$selectedId/pins');
      pins = p['pins'] ?? [];
      notice = strings.msgPinned;
    });
  }

  Future<void> saveToKeep(String msgId, String body) {
    return run(() async {
      await api.call('/api/v1/saved-messages', method: 'POST', data: {'message_id': msgId});
      await reload();
      notice = strings.msgKept;
    });
  }

  Future<void> createFeedPost(String body) {
    final title = feedPostTitleOf(body);
    if (title.isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/voom', method: 'POST', data: {'title': title});
      await reload();
      notice = strings.msgFeedPosted;
    });
  }

  Future<void> postStory(String body) {
    if (body.trim().isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/stories', method: 'POST', data: {'body': body.trim()});
      await reload();
      notice = strings.msgStoryPosted;
    });
  }

  /// Returns the new group conversation id so the page can navigate to it.
  Future<String?> createGroup(String title, List<String> memberIds) async {
    String? conversationId;
    await run(() async {
      final c = await api.call('/api/v1/conversations', method: 'POST', data: {
        'kind': 'group',
        'member_ids': memberIds,
        'title': title.trim(),
      });
      conversationId = c['id'] as String?;
      await reload();
    });
    return conversationId;
  }

  // F6: group room management. run() is not reentrant, so _refreshRoom stays
  // outside it and every public method below wraps exactly one run().
  Future<void> _refreshRoom(String id) async {
    selectedRoom = await api.call('/api/v1/conversations/$id');
    notifyListeners();
  }

  Future<void> loadRoomDetail(String id) {
    return run(() => _refreshRoom(id));
  }

  Future<void> renameRoom(String id, String title) {
    if (title.trim().isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/conversations/$id',
          method: 'PATCH', data: {'title': title.trim()});
      notice = strings.msgRoomRenamed;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> setRoomNotice(String id, String text) {
    return run(() async {
      await api.call('/api/v1/conversations/$id',
          method: 'PATCH', data: {'notice': text.trim()});
      notice = strings.msgNoticeSaved;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> updateRoomPhotoFromPicker(String id,
      {ImageSource source = ImageSource.gallery}) {
    return run(() async {
      final picked = await ImagePicker().pickImage(
          source: source,
          maxWidth: 512,
          maxHeight: 512,
          imageQuality: 70);
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      if (bytes.length > 262144) {
        throw Exception(strings.errRoomPhotoBig);
      }
      final kind = _avatarKindOf(bytes);
      if (kind == null) {
        throw Exception(strings.errPhotoType);
      }
      await api.call('/api/v1/conversations/$id',
          method: 'PATCH',
          data: {'avatar': 'data:image/$kind;base64,${base64Encode(bytes)}'});
      notice = strings.msgRoomPhotoSet;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> clearRoomPhoto(String id) {
    return run(() async {
      await api.call('/api/v1/conversations/$id',
          method: 'PATCH', data: {'avatar': ''});
      notice = strings.msgRoomPhotoCleared;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> inviteMembers(String id, List<String> memberIds) {
    if (memberIds.isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/conversations/$id/members',
          method: 'POST', data: {'member_ids': memberIds});
      notice = strings.gsInviteDone;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> kickMember(String id, String userId) {
    return run(() async {
      await api.call('/api/v1/conversations/$id/members/$userId',
          method: 'DELETE');
      notice = strings.msgExported;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> setMemberRole(String id, String userId, String role) {
    return run(() async {
      await api.call('/api/v1/conversations/$id/members/$userId/role',
          method: 'PATCH', data: {'role': role});
      notice = role == 'admin' ? strings.msgMadeAdmin : strings.msgMadeMember;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> transferRoom(String id, String userId) {
    return run(() async {
      await api.call('/api/v1/conversations/$id',
          method: 'PATCH', data: {'owner_id': userId});
      notice = strings.msgOwnerPassed;
      await _refreshRoom(id);
      await reload();
    });
  }

  Future<void> leaveChat(String id) {
    return run(() async {
      await api.call('/api/v1/conversations/$id', method: 'DELETE');
      if (selectedId == id) {
        selectedId = '';
        selectedTitle = '';
        selectedRoom = {};
        messages = [];
      }
      notice = strings.msgLeftGroup;
      await reload();
    });
  }

  Future<void> loadRoomInvites(String id) {
    return run(() async {
      final res = await api.call('/api/v1/conversations/$id/invites');
      roomInvites = res['invites'] ?? [];
      notifyListeners();
    });
  }

  Future<void> createRoomInvite(String id, int hours) {
    return run(() async {
      await api.call('/api/v1/conversations/$id/invites',
          method: 'POST', data: {'expires_in_hours': hours});
      final res = await api.call('/api/v1/conversations/$id/invites');
      roomInvites = res['invites'] ?? [];
      notice = strings.msgInviteMade;
      notifyListeners();
    });
  }

  Future<void> revokeRoomInvite(String id, String token) {
    return run(() async {
      await api.call('/api/v1/conversations/$id/invites/$token',
          method: 'DELETE');
      final res = await api.call('/api/v1/conversations/$id/invites');
      roomInvites = res['invites'] ?? [];
      notice = strings.msgInviteRevoked;
      notifyListeners();
    });
  }

  /// Returns the joined conversation id so the page can navigate to it.
  /// F21: invite links land here; failures surface localized notices.
  Future<String?> joinGroup(String token) async {
    String? conversationId;
    await run(() async {
      try {
        final c = await api.call('/api/v1/conversations/join',
            method: 'POST', data: {'token': token.trim()});
        conversationId = c['id'] as String?;
        notice = strings.msgJoinedGroup;
        await reload();
      } on ApiException catch (e) {
        notice = switch (e.statusCode) {
          404 => strings.inviteInvalid,
          410 => strings.inviteExpired,
          409 => strings.inviteAlreadyIn,
          _ => strings.errTransient,
        };
        notifyListeners();
      }
    });
    return conversationId;
  }

  Future<void> _refreshArchives() async {
    if (selectedId.isEmpty) return;
    final res = await Future.wait([
      api.call('/api/v1/conversations/$selectedId/notes').catchError((_) => <String, dynamic>{'notes': []}),
      api.call('/api/v1/conversations/$selectedId/events').catchError((_) => <String, dynamic>{'events': []}),
      api.call('/api/v1/conversations/$selectedId/polls').catchError((_) => <String, dynamic>{'polls': []}),
      api.call('/api/v1/conversations/$selectedId/albums').catchError((_) => <String, dynamic>{'albums': []}),
    ]);
    notes = res[0]['notes'] ?? [];
    events = res[1]['events'] ?? [];
    polls = res[2]['polls'] ?? [];
    albums = res[3]['albums'] ?? [];
    notifyListeners();
  }

  Future<void> createNote({String title = '', required String body}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/notes',
          method: 'POST',
          data: {'title': title.trim(), 'body': body.trim()});
      notice = strings.msgNoteSaved;
      await _refreshArchives();
    });
  }

  Future<void> createEvent(
      {required String title, String startsAt = '', String location = ''}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final data = <String, dynamic>{'title': title.trim()};
      if (startsAt.trim().isNotEmpty) data['starts_at'] = startsAt.trim();
      if (location.trim().isNotEmpty) data['location'] = location.trim();
      await api.call('/api/v1/conversations/$selectedId/events',
          method: 'POST', data: data);
      notice = strings.msgEventMade;
      await _refreshArchives();
    });
  }

  Future<void> createPoll(String question, String optionsText) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final options = pollOptionsOf(optionsText);
      if (!pollFormValid(question, options)) {
        throw Exception(strings.errPollNeedsOptions);
      }
      await api.call('/api/v1/conversations/$selectedId/polls',
          method: 'POST',
          data: {
            'question': question.trim(),
            'options': options,
          });
      notice = strings.msgPollMade;
      await _refreshArchives();
    });
  }

  Future<void> votePoll(String pollId, String optionId) {
    return run(() async {
      await api.call('/api/v1/polls/$pollId/vote',
          method: 'POST', data: {'option_id': optionId});
      notice = strings.msgVoted;
      await _refreshArchives();
    });
  }

  Future<void> rsvpEvent(String eventId, String status) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/events/$eventId/rsvp',
          method: 'POST', data: {'status': status});
      notice = strings.msgRsvpSent;
      await _refreshArchives();
    });
  }

  Future<void> createAlbum(String title, {bool includePhotos = true}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final ids =
          includePhotos ? roomImageAttachmentIds(messages) : <String>[];
      await api.call('/api/v1/conversations/$selectedId/albums',
          method: 'POST',
          data: {
            'title': title.trim(),
            'attachment_ids': ids,
          });
      notice = strings.msgAlbumMade;
      await _refreshArchives();
    });
  }

  String? _avatarKindOf(Uint8List bytes) {
    if (bytes.length > 3 &&
        bytes[0] == 0xFF &&
        bytes[1] == 0xD8 &&
        bytes[2] == 0xFF) {
      return 'jpeg';
    }
    if (bytes.length > 4 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4E &&
        bytes[3] == 0x47) {
      return 'png';
    }
    if (bytes.length > 12 &&
        bytes[0] == 0x52 &&
        bytes[1] == 0x49 &&
        bytes[2] == 0x46 &&
        bytes[3] == 0x46 &&
        bytes[8] == 0x57 &&
        bytes[9] == 0x45 &&
        bytes[10] == 0x42 &&
        bytes[11] == 0x50) {
      return 'webp';
    }
    return null;
  }

  Future<void> updateAvatarFromPicker(
      {ImageSource source = ImageSource.gallery}) {
    return run(() async {
      final picked = await ImagePicker().pickImage(
          source: source,
          maxWidth: 512,
          maxHeight: 512,
          imageQuality: 70);
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      if (bytes.length > 262144) {
        throw Exception(strings.errProfilePhotoBig);
      }
      final kind = _avatarKindOf(bytes);
      if (kind == null) {
        throw Exception(strings.errPhotoType);
      }
      await api.call('/api/v1/me', method: 'PATCH', data: {
        'avatar_url': 'data:image/$kind;base64,${base64Encode(bytes)}',
      });
      final me = await api.call('/api/v1/me');
      selfAvatarUrl = me['avatar_url'] ?? selfAvatarUrl;
      notice = strings.msgProfilePhotoSet;
      await reload();
    });
  }

  Future<void> updateProfile(
      {String? displayName,
      String? statusMessage,
      String? avatarUrl,
      String? coverUrl,
      String? birthday}) {
    return run(() async {
      final data = <String, dynamic>{};
      if (displayName != null) data['display_name'] = displayName.trim();
      if (statusMessage != null) data['status_message'] = statusMessage.trim();
      if (avatarUrl != null) data['avatar_url'] = avatarUrl.trim();
      if (coverUrl != null) data['cover_url'] = coverUrl.trim();
      if (birthday != null) data['birthday'] = birthday.trim();
      if (data.isEmpty) return;
      await api.call('/api/v1/me', method: 'PATCH', data: data);
      final me = await api.call('/api/v1/me');
      selfName = me['display_name'] ?? selfName;
      selfHandle = me['handle'] ?? selfHandle;
      selfStatusMessage = me['status_message'] ?? selfStatusMessage;
      selfAvatarUrl = me['avatar_url'] ?? selfAvatarUrl;
      selfCoverUrl = me['cover_url'] ?? selfCoverUrl;
      selfBirthday = me['birthday'] ?? selfBirthday;
      notice = strings.msgProfileSaved;
      await reload();
    });
  }

  Future<void> updateCoverFromPicker(
      {ImageSource source = ImageSource.gallery}) {
    return run(() async {
      final picked = await ImagePicker().pickImage(
          source: source,
          maxWidth: 1024,
          maxHeight: 512,
          imageQuality: 70);
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      if (bytes.length > 262144) {
        throw Exception(strings.errCoverBig);
      }
      final kind = _avatarKindOf(bytes);
      if (kind == null) {
        throw Exception(strings.errPhotoType);
      }
      await api.call('/api/v1/me', method: 'PATCH', data: {
        'cover_url': 'data:image/$kind;base64,${base64Encode(bytes)}',
      });
      final me = await api.call('/api/v1/me');
      selfCoverUrl = me['cover_url'] ?? selfCoverUrl;
      notice = strings.msgCoverSet;
      await reload();
    });
  }

  /// Raw load (no run()): login/restore call it nested under their own run().
  Future<void> loadPrefs() async {
    try {
      final res = await api.call('/api/v1/me/settings');
      myPrefs = Map<String, dynamic>.from(res);
      prefsLoaded = true;
      notifyListeners();
    } catch (_) {}
  }

  Future<void> setSearchableById(bool value) {
    return run(() async {
      if (!prefsLoaded) {
        await loadPrefs();
        if (!prefsLoaded) throw Exception(strings.errPrefsLoad);
      }
      final data = Map<String, dynamic>.from(myPrefs)
        ..['searchable_by_id'] = value;
      final res = await api.call('/api/v1/me/settings', method: 'PUT', data: data);
      myPrefs = Map<String, dynamic>.from(res);
      myPrefs['searchable_by_id'] = value;
      notice = value ? strings.msgIdSearchOn : strings.msgIdSearchOff;
    });
  }

  // F8: link preview toggle + per-URL preview cache (server caches in D1;
  // this map only dedups repeat renders on the device).
  final Map<String, Map<String, dynamic>> linkPreviewCache = {};

  Future<void> setLinkPreviews(bool value) {
    return run(() async {
      if (!prefsLoaded) {
        await loadPrefs();
        if (!prefsLoaded) throw Exception(strings.errPrefsLoad);
      }
      final data = Map<String, dynamic>.from(myPrefs)
        ..['link_previews'] = value;
      final res = await api.call('/api/v1/me/settings', method: 'PUT', data: data);
      myPrefs = Map<String, dynamic>.from(res);
      myPrefs['link_previews'] = value;
      notice = value ? strings.msgPreviewOn : strings.msgPreviewOff;
    });
  }

  Future<Map<String, dynamic>?> loadLinkPreview(String url) async {
    if (linkPreviewCache.containsKey(url)) {
      final hit = linkPreviewCache[url]!;
      return hit.isEmpty ? null : hit;
    }
    if (myPrefs['link_previews'] == false) return null;
    try {
      final res = await api.call(
          '/api/v1/link-preview?url=${Uri.encodeComponent(url)}');
      if (res['unavailable'] == true ||
          '${res['title'] ?? ''}'.isEmpty) {
        linkPreviewCache[url] = {};
        return null;
      }
      final pv = Map<String, dynamic>.from(res);
      linkPreviewCache[url] = pv;
      return pv;
    } catch (_) {
      return null;
    }
  }

  Future<void> _patchFriend(String friendId, Map<String, dynamic> data) {
    return run(() async {
      await api.call('/api/v1/friends/$friendId',
          method: 'PATCH', data: data);
      await reload();
    });
  }

  Future<void> toggleFavoriteFriend(String friendId, bool value) =>
      _patchFriend(friendId, {'favorite': value});

  Future<void> toggleBlockFriend(String friendId, bool value) =>
      _patchFriend(friendId, {'blocked': value});

  Future<void> createRoom(
      {required String name, String description = '', String nickname = ''}) {
    return run(() async {
      final data = <String, dynamic>{'name': name.trim()};
      if (description.trim().isNotEmpty) {
        data['description'] = description.trim();
      }
      if (nickname.trim().isNotEmpty) data['nickname'] = nickname.trim();
      final room = await api.call('/api/v1/community/rooms',
          method: 'POST', data: data);
      if (room['id'] != null) await _loadRoom(room['id'] as String);
      await reload();
    });
  }

  Future<void> joinRoom(String roomId, String nickname) {
    return run(() async {
      await api.call('/api/v1/community/rooms/$roomId/join',
          method: 'POST', data: {'nickname': nickname.trim()});
      await _loadRoom(roomId);
      await reload();
    });
  }

  Future<void> leaveRoom(String roomId) {
    return run(() async {
      await api.call('/api/v1/community/rooms/$roomId/leave', method: 'POST');
      if (this.roomId == roomId) {
        this.roomId = '';
        roomNickname = '';
        roomJoined = false;
        roomPosts = [];
      }
      notice = strings.msgLeftLounge;
      await reload();
    });
  }

  void closeRoom() {
    roomId = '';
    roomNickname = '';
    roomJoined = false;
    roomPosts = [];
    notifyListeners();
  }

  Future<void> openRoom(String roomId) {
    return run(() => _loadRoom(roomId));
  }

  Future<void> _loadRoom(String roomId) async {
    final res = await api.call('/api/v1/community/rooms/$roomId/posts');
    this.roomId = roomId;
    roomPosts = res['posts'] ?? [];
    roomJoined = res['joined'] == true;
    final nick = res['nickname'];
    if (nick is String) roomNickname = nick;
    notifyListeners();
  }

  Future<void> postRoom(String roomId, String body) {
    return run(() async {
      await api.call('/api/v1/community/rooms/$roomId/posts',
          method: 'POST', data: {'body': body.trim()});
      notice = strings.msgPostedLounge;
      await _loadRoom(roomId);
      await reload();
    });
  }

  Future<void> likeRoomPost(String roomId, String postId) {
    return run(() async {
      await api.call('/api/v1/community/rooms/$roomId/posts/$postId/like',
          method: 'POST');
      await _loadRoom(roomId);
    });
  }

  Future<void> sendFile() {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final picked =
          await FilePicker.platform.pickFiles(withData: true);
      final files = picked?.files ?? [];
      if (files.isEmpty) {
        notice = strings.errNoFilePicked;
        return;
      }
      final f = files.first;
      final bytes = f.bytes;
      if (bytes == null || bytes.isEmpty) {
        throw Exception(strings.errFileUnreadable);
      }
      if (bytes.length > maxFileBytes) {
        throw Exception(strings.errFileTooBig14);
      }
      final name = f.name.isNotEmpty
          ? f.name
          : 'file-${DateTime.now().millisecondsSinceEpoch}';
      const mime = 'application/octet-stream';
      final att = await api.call('/api/v1/attachments', method: 'POST', data: {
        'conversation_id': selectedId,
        'original_name': name,
        'mime_type': mime,
        'size_bytes': bytes.length,
        'content_base64': base64Encode(bytes),
      });
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': 'file',
        'body': att['original_name'] ?? name,
        'metadata': attachmentMessageMetadata(
            id: att['id'], mime: mime, size: bytes.length),
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      await refreshChatList();
    });
  }

  Future<String?> downloadAttachment(String attachmentId, String fileName) async {
    String? saved;
    await run(() async {
      final res = await http
          .get(
            Uri.parse(attachmentContentUrl(api.baseUrl, attachmentId)),
            headers: {
              if (api.token != null) 'Authorization': 'Bearer ${api.token}',
            },
          )
          .timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) {
        throw Exception(strings.errFileReceive(res.statusCode));
      }
      Directory? dir;
      if (Platform.isAndroid) {
        dir = await getExternalStorageDirectory();
      }
      dir ??= await getApplicationDocumentsDirectory();
      final safe = fileName.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
      final file = File('${dir.path}/$safe');
      await file.writeAsBytes(res.bodyBytes);
      saved = file.path;
      notice = strings.msgSavedAs(safe);
    });
    return saved;
  }

  Future<void> likeFeed(String postId) {
    return run(() async {
      await api.call('/api/v1/voom/$postId/like', method: 'POST');
      await reload();
    });
  }

  // F13: money UI stays in "preparing" state unless /version says on.
  bool paymentsEnabled = false;

  Future<void> loadPaymentsFlag() async {
    try {
      final res = await api.call('/api/v1/version');
      paymentsEnabled = res['payments_enabled'] == true;
    } catch (_) {
      paymentsEnabled = false;
    }
    notifyListeners();
  }

  Future<void> chargeWallet(int amount) {
    return run(() async {
      await api.call('/api/v1/wallet/charge', method: 'POST', data: {'amount': amount});
      await reload();
      notice = strings.msgTopupDone(money(amount));
    });
  }

  Future<void> sendPayInChat() {
    if (selectedId.isEmpty) return Future.value();
    dynamic conversation;
    for (final c in chats) {
      if (c is Map && '${c['id']}' == selectedId) conversation = c;
    }
    final peerId = sendPeerIdOf(conversation: conversation, selfId: selfId);
    if (peerId == null) {
      notice = strings.errPayDmOnly;
      notifyListeners();
      return Future.value();
    }
    if (!paymentsEnabled) {
      notice = strings.mvPaymentsPreparing;
      notifyListeners();
      return Future.value();
    }
    return run(() async {
      await api.call('/api/v1/wallet/send', method: 'POST', data: {
        'to_user_id': peerId,
        'amount': 10000,
        'note': strings.payNoteRoom(selectedTitle),
      });
      await _loadRoomData(selectedId, selectedTitle);
      await refreshChatList();
      notice = strings.msgPayDone10k;
    });
  }

  Future<void> exportGdprData() {
    // Served by GET /api/v1/me/export-data (parity gap closure).
    return run(() async {
      final res = await api.call('/api/v1/me/export-data');
      notice = strings.msgGdprBackup(res['stats']?['conversations_count'] ?? 0);
    });
  }

  // C3: compare the installed build against /api/v1/app/latest and stage an
  // advisory for the settings page. Silent on any failure: an update check
  // must never break the session.
  Future<void> checkForUpdate() async {
    try {
      final res = await api.call('/api/v1/app/latest');
      final info = await PackageInfo.fromPlatform();
      currentAppVersion = '${info.version}+${info.buildNumber}';
      latestAppVersion = '${res['version']}+${res['build']}';
      appUpdate = compareAppVersions(currentAppVersion, latestAppVersion);
    } catch (_) {
      appUpdate = UpdateKind.none;
    }
    notifyListeners();
  }

  /// H-4/F3: schedule account deletion (server DELETE /api/v1/me with
  /// password, reason and email confirm phrase), then wipe local state.
  /// The server keeps a 30-day grace; logging in inside restores.
  Future<void> deleteAccount(String password,
      {String reason = '', required String confirmText}) {
    return run(() async {
      await api.call('/api/v1/me', method: 'DELETE', data: {
        'password': password,
        if (reason.isNotEmpty) 'reason': reason,
        'confirm_text': confirmText,
      });
      notice = strings.msgDeleteScheduled;
      await logout();
    });
  }

  /// Security-notice remote logout: revokes the session named by the
  /// notice (server POST /api/v1/auth/sessions/revoke). Revoking the
  /// current device drops local credentials too, like the web client.
  Future<void> revokeNoticeSession(String sessionId) {
    return run(() async {
      final res = await api.call('/api/v1/auth/sessions/revoke',
          method: 'POST', data: {'session_id': sessionId});
      if (res['self'] == true) {
        notice = strings.msgLoggedOutHere;
        await logout();
      } else {
        notice = strings.msgLoggedOutTarget;
      }
    });
  }

  /// Password change (server POST /api/v1/auth/change-password).
  Future<void> changePassword(String currentPassword, String newPassword) {
    return run(() async {
      await api.call('/api/v1/auth/change-password',
          method: 'POST',
          data: {
            'current_password': currentPassword,
            'new_password': newPassword
          });
      notice = strings.msgPwChanged;
    });
  }

  /// Signed-in devices (server GET /api/v1/devices; the unscoped form
  /// both the worker and the Go backend implement).
  List<dynamic> devices = [];

  Future<void> loadDevices() {
    return run(() async {
      final res = await api.call('/api/v1/devices');
      devices = res['devices'] ?? [];
    });
  }

  /// Revokes one device session (server DELETE /api/v1/devices/:id).
  /// Revoking the current device drops local credentials too.
  Future<void> revokeDevice(String sessionId) {
    return run(() async {
      final res = await api.call('/api/v1/devices/$sessionId',
          method: 'DELETE');
      if (res['self'] == true) {
        notice = strings.msgLoggedOutHere;
        await logout();
      } else {
        notice = strings.msgDeviceLoggedOut;
        await loadDevices();
      }
    });
  }

  Future<void> logout() async {
    // While the access token is still valid: this device stops getting push.
    await _unregisterPush();
    reconnectTimer?.cancel();
    reconnectTimer = null;
    _pingTimer?.cancel();
    _pingTimer = null;
    roomBots = [];
    roomBotCommands = false;
    roomBotsFor = '';
    reconnectAttempt = 0;
    await wsSubscription?.cancel();
    await socket?.sink.close();
    await storage.delete(key: 'access_token');
    await storage.delete(key: 'device_id');
      await storage.delete(key: 'refresh_token');
    api.token = null;
      api.refreshToken = null;
    deviceId = '';
    selfId = '';
    chats = [];
    friends = [];
    messages = [];
    selectedId = '';
    activeCall = null;
    _clearGroupCallLocal();
    notifyListeners();
  }

  // --- Console: existing admin APIs -------------------------------------------

  Future<void> loadAdminStats() {
    return run(() async {
      adminStats = await api.call('/api/v1/admin/stats');
    });
  }

  Future<void> loadAdminUsers() {
    return run(() async {
      final res = await api.call('/api/v1/admin/users');
      adminUsers = res['users'] ?? [];
    });
  }

  Future<void> loadAdminReports() {
    return run(() async {
      final res = await api.call('/api/v1/admin/reports');
      adminReports = res['reports'] ?? [];
    });
  }

  Future<void> loadAdminAuditLogs() {
    return run(() async {
      final res = await api.call('/api/v1/admin/audit-logs');
      adminAuditLogs = res['logs'] ?? res['audit_logs'] ?? [];
    });
  }

  Future<void> loadFeatureFlags() {
    return run(() async {
      final res = await api.call('/api/v1/admin/feature-flags');
      featureFlags = res['flags'] ?? res['feature_flags'] ?? [];
    });
  }

  Future<void> moderationAction({
    required String subjectUserId,
    required String action,
    String reportId = '',
    String reason = '',
  }) {
    return run(() async {
      await api.call('/api/v1/admin/moderation/actions', method: 'POST', data: {
        if (reportId.isNotEmpty) 'report_id': reportId,
        'subject_user_id': subjectUserId,
        'action': action,
        if (reason.isNotEmpty) 'reason': reason,
      });
      final res = await api.call('/api/v1/admin/reports');
      adminReports = res['reports'] ?? [];
      notice = strings.msgModLogged;
    });
  }

  Future<void> upsertFeatureFlag(String key, bool enabled) {
    return run(() async {
      await api.call('/api/v1/admin/feature-flags', method: 'PUT', data: {
        'key': key,
        'enabled': enabled,
      });
      final res = await api.call('/api/v1/admin/feature-flags');
      featureFlags = res['flags'] ?? res['feature_flags'] ?? [];
      notice = strings.msgFlagSaved2;
    });
  }

  // --- Local UI state ----------------------------------------------------------

  void setAutoTranslate(bool value) {
    autoTranslate = value;
    notifyListeners();
  }

  void setTargetTranslateLang(String value) {
    targetTranslateLang = value;
    notifyListeners();
  }

  /// LUNO200 catalog (memory cache; loaded when the sticker picker opens).
  List<Map<String, dynamic>> stickerCategories = [];
  bool stickerCatalogLoading = false;
  Future<void> loadStickerCatalog() async {
    if (stickerCategories.isNotEmpty || stickerCatalogLoading) return;
    stickerCatalogLoading = true;
    try {
      final x = await api.call('/stickers/catalog.json');
      final cats = x['categories'];
      if (cats is List) {
        stickerCategories = [
          for (final c in cats)
            if (c is Map)
              {
                'id': '${c['id']}',
                'ko': '${c['ko'] ?? ''}',
                'en': '${c['en'] ?? ''}',
                'items': [
                  for (final i in (c['items'] as List? ?? []))
                    if (i is Map)
                      {
                        'id': '${i['id']}',
                        'char': '${i['char'] ?? ''}',
                        'label': '${i['label'] ?? ''}'
                      }
                ],
              }
        ];
        notifyListeners();
      }
    } catch (_) {
      // Stickers stay unavailable until the next open; nothing else breaks.
    } finally {
      stickerCatalogLoading = false;
    }
  }

  String stickerCategoryTitle(Map<String, dynamic> c) {
    if (locale.startsWith('ko') && '${c['ko']}'.isNotEmpty) return '${c['ko']}';
    if ('${c['en']}'.isNotEmpty) return '${c['en']}';
    return '${c['ko'] ?? c['id']}';
  }

  void toggleStickerPicker() {
    showStickerPicker = !showStickerPicker;
    if (showStickerPicker) loadStickerCatalog();
    notifyListeners();
  }

  void setReply(String msgId) {
    replyToId = msgId;
    notifyListeners();
  }

  // F7: message edit, delete-for-me, and forward into another room.
  Future<void> editMessage(String msgId, String body) {
    if (body.trim().isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId',
          method: 'PATCH', data: {'body': body.trim()});
      for (final m in messages) {
        if (m['id'] == msgId) {
          m['body'] = body.trim();
          m['edited_at'] = DateTime.now().toUtc().toIso8601String();
        }
      }
      notice = strings.msgEdited;
    });
  }

  Future<void> hideMessage(String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId/hide',
          method: 'POST');
      messages.removeWhere((m) => m['id'] == msgId);
      notice = strings.mvHideDone;
    });
  }

  Future<void> forwardMessage(String targetCid, String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId/forward',
          method: 'POST', data: {'to_conversation_id': targetCid});
      notice = strings.mvForwarded;
      await refreshChatList();
    });
  }

  // --- Pure helpers (identical to legacy) ---------------------------------------

  String uuid() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return bytes.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  }

  /// 1234567 -> "1,234,567"
  String money(int value) {
    final digits = value.abs().toString();
    final buf = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buf.write(',');
      buf.write(digits[i]);
    }
    return (value < 0 ? '-' : '') + buf.toString();
  }

  String formatDuration(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    if (m >= 60) {
      return '${m ~/ 60}:${(m % 60).toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    }
    return '$m:${s.toString().padLeft(2, '0')}';
  }

  // Server timestamps are ISO-8601. Anything unparseable is shown verbatim
  // rather than being turned into a misleading "방금 전".
  String relTime(dynamic iso) {
    final raw = iso?.toString() ?? '';
    final at = DateTime.tryParse(raw);
    if (at == null) return raw;
    final min = DateTime.now().difference(at).inMinutes;
    if (min < 1) return strings.mvJustNow;
    if (min < 60) return strings.relMinutesAgo(min);
    if (min < 60 * 24) return strings.relHoursAgo((min / 60).round());
    return strings.relDaysAgo((min / 1440).round());
  }

  /// Someone's profile photo / cover as an image, or null (initials then).
  ImageProvider? photoOf(dynamic url) {
    final u = url == null ? '' : '$url'.trim();
    if (u.isEmpty) return null;
    return profilePhotoImage(api.baseUrl, u, token: api.token);
  }

  /// The member brief for [userId] in a room (avatar, name), if loaded.
  Map<String, dynamic>? memberOf(String conversationId, String userId) {
    for (final c in chats) {
      if (c is! Map || '${c['id']}' != conversationId) continue;
      final ms = c['members'];
      if (ms is! List) return null;
      for (final m in ms) {
        if (m is Map && '${m['id']}' == userId) {
          return Map<String, dynamic>.from(m);
        }
      }
    }
    return null;
  }

  /// The other person in a 1:1 room.
  Map<String, dynamic>? peerOf(Map room) {
    final ms = room['members'];
    if (ms is! List) return null;
    for (final m in ms) {
      if (m is Map && '${m['id']}' != selfId) {
        return Map<String, dynamic>.from(m);
      }
    }
    return null;
  }

  // Server colours arrive as #RRGGBB. Anything else falls back.
  Color colorFromHex(String? hex, Color fallback) {
    final value = (hex ?? '').replaceFirst('#', '');
    if (value.length != 6) return fallback;
    final parsed = int.tryParse(value, radix: 16);
    return parsed == null ? fallback : Color(0xFF000000 | parsed);
  }

  void disposeAll() {
    reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _noAnswerTimer?.cancel();
    _callTimer?.cancel();
    _groupCallTimer?.cancel();
    wsSubscription?.cancel();
    socket?.sink.close();
    final media = callMedia;
    callMedia = null;
    if (media != null) unawaited(media.dispose().catchError((_) {}));
    super.dispose();
  }
}

class SessionScope extends InheritedNotifier<SessionController> {
  const SessionScope({super.key, required SessionController super.notifier, required super.child});

  static SessionController of(BuildContext context, {bool listen = true}) {
    if (listen) {
      return context.dependOnInheritedWidgetOfExactType<SessionScope>()!.notifier!;
    }
    final scope = context.getInheritedWidgetOfExactType<SessionScope>();
    return scope!.notifier!;
  }
}
