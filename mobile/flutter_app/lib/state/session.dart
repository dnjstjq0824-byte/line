// Session state extracted verbatim from the pre-renewal Home widget.
//
// Every API path, payload key and behaviour here is identical to the legacy
// client — only the setState plumbing changed to ChangeNotifier so that
// go_router pages can share one session. No backend contract change.
import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../api/client.dart';
import '../legacy_tokens.dart';
import '../util/attachments.dart';
import '../util/channel_slot.dart';
import '../util/photo_effects.dart';
import '../util/error_report.dart';

class SessionController extends ChangeNotifier {
  final Api api = Api();

  bool busy = false;
  bool registerMode = false;
  bool showStickerPicker = false;
  bool autoTranslate = false;
  String targetTranslateLang = 'ko'; // ko, en, th, ja, zh, es

  String error = '';
  String notice = '';
  String selfId = '';
  String deviceId = '';
  String selfName = '';
  String selfHandle = '';
  String selfStatusMessage = '';

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
  List<dynamic> feedPosts = [];
  List<dynamic> stories = [];
  List<dynamic> openRooms = [];
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
  final Set<String> dismissedChannelSlots = {};

  void dismissChannelSlot(String id) {
    dismissedChannelSlots.add(id);
    notifyListeners();
  }

  String selectedId = '';
  String selectedTitle = '';
  String replyToId = '';
  String editingMsgId = '';

  Map<String, dynamic>? activeCall;
  WebSocketChannel? socket;
  StreamSubscription? wsSubscription;

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
    final saved = await storage.read(key: 'access_token');
    if (saved == null) return;
    api.token = saved;
    deviceId = await storage.read(key: 'device_id') ?? '';
    try {
      final me = await api.call('/api/v1/me');
      selfId = me['id'] ?? '';
      selfName = me['display_name'] ?? 'LUNO User';
      selfHandle = me['handle'] ?? '';
      selfStatusMessage = me['status_message'] ?? '';
      notifyListeners();
      await reload();
      await connect();
    } catch (_) {
      await storage.delete(key: 'access_token');
      await storage.delete(key: 'device_id');
      api.token = null;
      deviceId = '';
    }
  }

  void setRegisterMode(bool value) {
    registerMode = value;
    notifyListeners();
  }

  Future<void> login({
    required String email,
    required String password,
    required String displayName,
  }) async {
    await run(() async {
      if (registerMode) {
        await api.call('/api/v1/auth/register', method: 'POST', data: {
          'email': email.trim(),
          'password': password,
          'display_name': displayName.trim(),
        });
        registerMode = false;
        notice = 'LUNO 계정이 생성되었습니다. 로그인해주세요.';
        notifyListeners();
        return;
      }
      final result = await api.call('/api/v1/auth/login', method: 'POST', data: {
        'email': email.trim(),
        'password': password,
        'platform': 'android',
        'device_name': 'LUNO Android Client',
      });
      api.token = result['access_token'];
      deviceId = result['device_id'] ?? '';
      await storage.write(key: 'access_token', value: api.token);
      await storage.write(key: 'device_id', value: deviceId);
      final me = await api.call('/api/v1/me');
      selfId = me['id'] ?? '';
      selfName = me['display_name'] ?? 'LUNO User';
      selfHandle = me['handle'] ?? '';
      selfStatusMessage = me['status_message'] ?? '';
      notifyListeners();
      await reload();
      await connect();
    });
  }

  Future<void> approveDesktopQR(String challengeId, String qrToken) {
    return run(() async {
      await api.call('/api/v1/auth/qr/approve', method: 'POST', data: {
        'challenge_id': challengeId.trim(),
        'qr_token': qrToken.trim(),
      });
      notice = 'PC/웹 데스크톱 로그인을 승인했습니다.';
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
    ]);
    chats = resultsList[0]['conversations'] ?? [];
    friends = resultsList[1]['friends'] ?? [];
    officialAccounts = resultsList[2]['official_accounts'] ?? [];
    feedPosts = resultsList[3]['posts'] ?? [];
    stories = resultsList[4]['stories'] ?? [];
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
    notifyListeners();
  }

  Future<void> connect() async {
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
      wsSubscription = socket!.stream.listen((event) {
        try {
          final data = jsonDecode(event);
          if (data['type'] == 'message.created') {
            final item = data['message'];
            if (item['conversation_id'] == selectedId &&
                !messages.any((m) => m['id'] == item['id'])) {
              messages.add(item);
              if (autoTranslate && item['sender_id'] != selfId && item['kind'] == 'text') {
                translateMessage(item['id'], item['body']);
              }
              notifyListeners();
            }
            reload();
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
            reload();
          } else if (data['type'] == 'call.ringing') {
            activeCall = data;
            notifyListeners();
          } else if (data['type'] == 'call.state' && data['state'] == 'ended') {
            activeCall = null;
            notifyListeners();
          }
        } catch (_) {}
      }, onError: (_) {
        notice = '실시간 연결 재시도 중...';
        notifyListeners();
      });
    } catch (_) {}
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
      notice = '친구를 추가했습니다.';
      await reload();
    });
  }

  String titleOf(String conversationId) {
    for (final c in chats) {
      if (c['id'] == conversationId) {
        final title = '${c['title'] ?? ''}';
        return title.isEmpty ? '대화방' : title;
      }
    }
    return '대화방';
  }

  Future<void> openChat(String id, [String? title]) {
    return run(() async {
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
      ]);
      messages = resultsList[0]['messages'] ?? [];
      pins = resultsList[1]['pins'] ?? [];
      notes = resultsList[2]['notes'] ?? [];
      events = resultsList[3]['events'] ?? [];
      polls = resultsList[4]['polls'] ?? [];
      notifyListeners();
      if (messages.isNotEmpty) {
        await api.call('/api/v1/conversations/$id/read',
            method: 'POST', data: {'sequence': messages.last['sequence']});
        await reload();
      }
    });
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
      final x = await api.call('/api/v1/conversations/$selectedId/sync?after_sequence=$lastSeq');
      final list = x['messages'] as List<dynamic>;
      for (final m in list) {
        if (!messages.any((old) => old['id'] == m['id'])) messages.add(m);
      }
      notice = '오프라인 메시지 ${list.length}건 동기화 완료';
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
      final res = await api.call('/api/v1/calls', method: 'POST', data: {
        'conversation_id': conversationId,
        // Signaling-only invite: no WebRTC media stack in this build, so no SDP is offered.
        'kind': kind,
      });
      activeCall = res;
    });
  }

  Future<void> endCall() {
    if (activeCall == null) return Future.value();
    return run(() async {
      final callId = activeCall!['id'] ?? activeCall!['call_id'];
      await api.call('/api/v1/calls/$callId/state',
          method: 'POST', data: {'state': 'ended', 'end_reason': 'hangup'});
      activeCall = null;
    });
  }

  Future<void> send({String kind = 'text', String? customBody, String text = ''}) {
    if (selectedId.isEmpty) return Future.value();
    final body = customBody ?? text.trim();
    if (body.isEmpty) return Future.value();

    if (editingMsgId.isNotEmpty && customBody == null) {
      final targetId = editingMsgId;
      editingMsgId = '';
      notifyListeners();
      return run(() async {
        await api.call('/api/v1/conversations/$selectedId/messages/$targetId',
            method: 'PATCH', data: {'body': body});
        for (final m in messages) {
          if (m['id'] == targetId) m['body'] = body;
        }
        notice = '메시지를 수정했습니다.';
      });
    }

    final reply = replyToId;
    replyToId = '';
    showStickerPicker = false;
    notifyListeners();
    return run(() async {
      final x = await api.call('/api/v1/conversations/$selectedId/messages',
          method: 'POST', data: {
        'client_id': uuid(),
        'kind': kind,
        'body': body,
        if (reply.isNotEmpty) 'reply_to': reply,
      });
      if (!messages.any((m) => m['id'] == x['message']['id'])) {
        messages.add(x['message']);
      }
      await reload();
    });
  }

  Future<PickedImage?> pickChatImage(ImageSource source) async {
    final picked = await ImagePicker().pickImage(
        source: source, maxWidth: 1600, maxHeight: 1600, imageQuality: 85);
    if (picked == null) return null;
    final bytes = await picked.readAsBytes();
    if (bytes.length > maxAttachmentBytes) {
      throw Exception('파일이 너무 큽니다 (최대 512KB)');
    }
    return PickedImage(
        bytes: bytes, name: picked.name, mime: picked.mimeType ?? 'image/jpeg');
  }

  Future<void> sendPickedImage(PickedImage pic, {String effect = 'none'}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      final bytes = applyPhotoEffect(pic.bytes, effect);
      if (bytes.length > maxAttachmentBytes) {
        throw Exception('파일이 너무 큽니다 (최대 512KB)');
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
      await reload();
    });
  }

  Future<void> sendVoice(Uint8List bytes,
      {required int durationSec,
      String mime = 'audio/mp4',
      String name = 'voice-note.m4a'}) {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      if (bytes.length > maxAttachmentBytes) {
        throw Exception('파일이 너무 큽니다 (최대 512KB)');
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
      await reload();
    });
  }

  Future<void> translateMessage(String msgId, String text) async {
    if (translations.containsKey(msgId)) {
      translations.remove(msgId);
      notifyListeners();
      return;
    }
    translations[msgId] = {'loading': true};
    notifyListeners();
    try {
      // No translation engine is configured: the server answers 503 -> catch below.
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
    } catch (e) {
      translations[msgId] = {'loading': false, 'error': '번역 실패'};
    }
    notifyListeners();
  }

  Future<void> unsend(String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId', method: 'DELETE');
      messages.removeWhere((m) => m['id'] == msgId);
      notice = '메시지 전송을 취소했습니다.';
    });
  }

  Future<void> react(String msgId, String emoji) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId/reactions',
          method: 'POST', data: {'reaction': emoji});
      notice = '$emoji 리액션을 남겼습니다.';
    });
  }

  Future<void> pin(String msgId) {
    return run(() async {
      await api.call('/api/v1/conversations/$selectedId/pins',
          method: 'POST', data: {'message_id': msgId});
      final p = await api.call('/api/v1/conversations/$selectedId/pins');
      pins = p['pins'] ?? [];
      notice = '공지로 등록했습니다.';
    });
  }

  Future<void> saveToKeep(String msgId, String body) {
    return run(() async {
      await api.call('/api/v1/saved-messages', method: 'POST', data: {'message_id': msgId});
      await reload();
      notice = 'LUNO Keep에 보관했습니다.';
    });
  }

  Future<void> createFeedPost(String body) {
    if (body.trim().isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/voom', method: 'POST', data: {'body': body.trim()});
      await reload();
      notice = 'LUNO 피드 포스트를 게시했습니다.';
    });
  }

  Future<void> likeFeed(String postId) {
    return run(() async {
      await api.call('/api/v1/voom/$postId/like', method: 'POST');
      await reload();
    });
  }

  Future<void> chargeWallet(int amount) {
    return run(() async {
      await api.call('/api/v1/wallet/charge', method: 'POST', data: {'amount': amount});
      await reload();
      notice = 'LUNO Pay ₩${money(amount)} 충전 완료!';
    });
  }

  Future<void> sendPayInChat() {
    if (selectedId.isEmpty) return Future.value();
    return run(() async {
      await api.call('/api/v1/wallet/send', method: 'POST', data: {
        'conversation_id': selectedId,
        'amount': 10000,
        'title': '$selectedTitle 송금',
      });
      await openChat(selectedId, selectedTitle);
      await reload();
      notice = 'LUNO Pay ₩10,000 송금을 완료했습니다.';
    });
  }

  Future<void> exportGdprData() {
    // Served by GET /api/v1/me/export-data (parity gap closure).
    return run(() async {
      final res = await api.call('/api/v1/me/export-data');
      notice = 'GDPR 데이터 백업 파일 생성 완료 (${res['stats']?['conversations_count'] ?? 0}개 대화)';
    });
  }

  Future<void> logout() async {
    await wsSubscription?.cancel();
    await socket?.sink.close();
    await storage.delete(key: 'access_token');
    await storage.delete(key: 'device_id');
    api.token = null;
    deviceId = '';
    selfId = '';
    chats = [];
    friends = [];
    messages = [];
    selectedId = '';
    activeCall = null;
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
      notice = '모더레이션 조치를 기록했습니다.';
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
      notice = '플래그를 저장했습니다.';
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

  void toggleStickerPicker() {
    showStickerPicker = !showStickerPicker;
    notifyListeners();
  }

  void setReply(String msgId) {
    replyToId = msgId;
    notifyListeners();
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
    if (min < 1) return '방금 전';
    if (min < 60) return '$min분 전';
    if (min < 60 * 24) return '${(min / 60).round()}시간 전';
    return '${(min / 1440).round()}일 전';
  }

  // Server colours arrive as #RRGGBB. Anything else falls back.
  Color colorFromHex(String? hex, Color fallback) {
    final value = (hex ?? '').replaceFirst('#', '');
    if (value.length != 6) return fallback;
    final parsed = int.tryParse(value, radix: 16);
    return parsed == null ? fallback : Color(0xFF000000 | parsed);
  }

  void disposeAll() {
    wsSubscription?.cancel();
    socket?.sink.close();
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
