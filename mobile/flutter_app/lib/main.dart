import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

// ============================================================================
// LUNO GLOBAL MESSENGER — DESIGN TOKENS (PO Master Directive v1.0)
// ============================================================================
const lunoPrimary = Color(0xFF4F7CFF);
const lunoDeepBlue = Color(0xFF315BCD);
const lunoSky = Color(0xFF8EC5FF);
const lunoMint = Color(0xFF5EE6C2);
const lunoNavy = Color(0xFF14213D);
const lunoBg = Color(0xFFF7FAFF);
const lunoSurface = Color(0xFFFFFFFF);
const lunoLightBlue = Color(0xFFEAF1FF);
const lunoMistGray = Color(0xFFD9E1EC);
const lunoSlateGray = Color(0xFF5B6475);

// LUNO Orbit Crew Official Characters (PO Master Directive v1.0)
const lunoOrbitCrewStickers = [
  {'id': 'lumi_hi', 'emoji': '🛸👋', 'label': '안녕!', 'character': 'Lumi'},
  {'id': 'nori_warm', 'emoji': '🪐❤️', 'label': '최고야!', 'character': 'Nori'},
  {'id': 'poko_love', 'emoji': '💫✨', 'label': '반짝여!', 'character': 'Poko'},
  {'id': 'luno_cheer', 'emoji': '🚀🔥', 'label': '화이팅!', 'character': 'Luno'},
  {'id': 'comet_laugh', 'emoji': '☄️😂', 'label': 'ㅋㅋㅋ', 'character': 'Comet'},
  {'id': 'astro_bow', 'emoji': '👨‍🚀🙇', 'label': '감사합니다', 'character': 'Astro'},
];

const lunoReactions = ['❤️', '👍', '😂', '😮', '😢', '🔥'];

const defaultApiBase = 'https://line-messenger.dnjstjqppk.workers.dev';
const apiBase = String.fromEnvironment('API_URL', defaultValue: defaultApiBase);
const storage = FlutterSecureStorage();

void main() => runApp(const MessengerApp());

class Api {
  String baseUrl = apiBase;
  String? token;

  Future<Map<String, dynamic>> call(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? data,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';

    late http.Response res;
    try {
      switch (method) {
        case 'POST':
          res = await http.post(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 15));
          break;
        case 'PUT':
          res = await http.put(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 15));
          break;
        case 'PATCH':
          res = await http.patch(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 15));
          break;
        case 'DELETE':
          res = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 15));
          break;
        default:
          res = await http.get(uri, headers: headers).timeout(const Duration(seconds: 15));
      }
    } catch (e) {
      throw Exception('네트워크 연결 오류: $e');
    }

    final parsed = jsonDecode(utf8.decode(res.bodyBytes));
    if (parsed is! Map<String, dynamic>) throw Exception('유효하지 않은 응답 형식');
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(parsed['error'] ?? 'HTTP 오류: ${res.statusCode}');
    }
    return parsed;
  }
}

class MessengerApp extends StatelessWidget {
  const MessengerApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'LUNO',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: lunoDeepBlue,
            primary: lunoDeepBlue,
            secondary: lunoMint,
            surface: lunoSurface,
          ),
          scaffoldBackgroundColor: lunoBg,
          useMaterial3: true,
          fontFamily: 'Pretendard',
          appBarTheme: const AppBarTheme(
            backgroundColor: lunoDeepBlue,
            foregroundColor: Colors.white,
            elevation: 0,
            centerTitle: false,
          ),
        ),
        home: const Home(),
      );
}

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}

class _HomeState extends State<Home> {
  final api = Api();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      search = TextEditingController(),
      message = TextEditingController(),
      qrChallenge = TextEditingController(),
      qrToken = TextEditingController(),
      groupTitle = TextEditingController(),
      statusMsgCtrl = TextEditingController(),
      feedInputCtrl = TextEditingController(),
      noteBodyCtrl = TextEditingController(),
      payAmountCtrl = TextEditingController(text: '10000');

  bool register = false,
      busy = false,
      letterSealing = true,
      showStickerPicker = false,
      autoTranslate = false;

  String targetTranslateLang = 'ko'; // ko, en, th, ja, zh, es
  int currentTab = 0; // 0: 홈/친구, 1: 대화, 2: 피드, 3: 라운지, 4: LUNO Pay, 5: 설정
  String error = '',
      notice = '',
      selfId = '',
      selfName = '',
      selfHandle = '',
      selfStatusMessage = '',
      selectedId = '',
      selectedTitle = '',
      replyToId = '',
      editingMsgId = '';

  int walletBalance = 54000, walletPoints = 1250;
  List<dynamic> chats = [],
      friends = [],
      officialAccounts = [],
      results = [],
      messages = [],
      pins = [],
      notes = [],
      events = [],
      polls = [],
      feedPosts = [],
      stories = [],
      openRooms = [],
      bookmarks = [],
      walletHistory = [];

  Map<String, dynamic>? activeCall;
  WebSocketChannel? socket;
  StreamSubscription? wsSubscription;

  // Real-time AI Translation Cache
  final Map<String, Map<String, dynamic>> translations = {};

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final saved = await storage.read(key: 'access_token');
    if (saved == null) return;
    api.token = saved;
    try {
      final me = await api.call('/api/v1/me');
      if (!mounted) return;
      setState(() {
        selfId = me['id'] ?? '';
        selfName = me['display_name'] ?? 'LUNO User';
        selfHandle = me['handle'] ?? '';
        selfStatusMessage = me['status_message'] ?? '';
        statusMsgCtrl.text = selfStatusMessage;
      });
      await _reload();
      await _connect();
      _registerPushToken();
    } catch (_) {
      await storage.delete(key: 'access_token');
      api.token = null;
    }
  }

  Future<void> _registerPushToken() async {
    try {
      await api.call('/api/v1/push-tokens', method: 'POST', data: {
        'token': 'fcm-mobile-${_uuid().substring(0, 12)}',
        'platform': 'android',
        'device_name': 'LUNO Mobile Flutter Client',
      });
    } catch (_) {}
  }

  Future<void> _do(Future<void> Function() action) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = '';
      notice = '';
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _login() async {
    _do(() async {
      if (register) {
        await api.call('/api/v1/auth/register', method: 'POST', data: {
          'email': email.text.trim(),
          'password': password.text,
          'display_name': name.text.trim(),
        });
        setState(() {
          register = false;
          notice = 'LUNO 계정이 생성되었습니다. 로그인해주세요.';
        });
        return;
      }
      final result = await api.call('/api/v1/auth/login', method: 'POST', data: {
        'email': email.text.trim(),
        'password': password.text,
        'platform': 'android',
        'device_name': 'LUNO Android Client',
      });
      api.token = result['access_token'];
      await storage.write(key: 'access_token', value: api.token);
      final me = await api.call('/api/v1/me');
      if (mounted) {
        setState(() {
          selfId = me['id'] ?? '';
          selfName = me['display_name'] ?? 'LUNO User';
          selfHandle = me['handle'] ?? '';
          selfStatusMessage = me['status_message'] ?? '';
          statusMsgCtrl.text = selfStatusMessage;
        });
      }
      password.clear();
      await _reload();
      await _connect();
      _registerPushToken();
    });
  }

  Future<void> _approveDesktopQR() async {
    _do(() async {
      await api.call('/api/v1/auth/qr/approve', method: 'POST', data: {
        'challenge_id': qrChallenge.text.trim(),
        'qr_token': qrToken.text.trim(),
      });
      qrChallenge.clear();
      qrToken.clear();
      setState(() => notice = 'PC/웹 데스크톱 로그인을 승인했습니다.');
    });
  }

  Future<void> _reload() async {
    final resultsList = await Future.wait([
      api.call('/api/v1/conversations').catchError((_) => <String, dynamic>{'conversations': []}),
      api.call('/api/v1/friends').catchError((_) => <String, dynamic>{'friends': []}),
      api.call('/api/v1/official-accounts').catchError((_) => <String, dynamic>{'official_accounts': []}),
      api.call('/api/v1/voom').catchError((_) => <String, dynamic>{'posts': []}),
      api.call('/api/v1/stories').catchError((_) => <String, dynamic>{'stories': []}),
      api.call('/api/v1/community/rooms').catchError((_) => <String, dynamic>{'rooms': []}),
      api.call('/api/v1/wallet').catchError((_) => <String, dynamic>{'balance': 54000, 'points': 1250, 'history': []}),
      api.call('/api/v1/bookmarks').catchError((_) => <String, dynamic>{'bookmarks': []}),
    ]);
    if (mounted) {
      setState(() {
        chats = resultsList[0]['conversations'] ?? [];
        friends = resultsList[1]['friends'] ?? [];
        officialAccounts = resultsList[2]['official_accounts'] ?? [];
        feedPosts = resultsList[3]['posts'] ?? [];
        stories = resultsList[4]['stories'] ?? [];
        openRooms = resultsList[5]['rooms'] ?? [];
        walletBalance = resultsList[6]['balance'] ?? 54000;
        walletPoints = resultsList[6]['points'] ?? 1250;
        walletHistory = resultsList[6]['history'] ?? [];
        bookmarks = resultsList[7]['bookmarks'] ?? [];
      });
    }
  }

  Future<void> _connect() async {
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
            if (mounted) {
              setState(() {
                if (item['conversation_id'] == selectedId && !messages.any((m) => m['id'] == item['id'])) {
                  messages.add(item);
                  if (autoTranslate && item['sender_id'] != selfId && item['kind'] == 'text') {
                    _translateMessage(item['id'], item['body']);
                  }
                }
              });
            }
            _reload();
          } else if (data['type'] == 'message.updated') {
            if (mounted && data['conversation_id'] == selectedId) {
              setState(() {
                for (final m in messages) {
                  if (m['id'] == data['message_id']) {
                    m['body'] = data['body'];
                    m['edited_at'] = data['edited_at'];
                  }
                }
              });
            }
          } else if (data['type'] == 'message.deleted' || data['type'] == 'message.unsent') {
            if (mounted && data['conversation_id'] == selectedId) {
              setState(() => messages.removeWhere((m) => m['id'] == data['message_id']));
            }
          } else if (data['type'] == 'conversation.read') {
            _reload();
          } else if (data['type'] == 'call.ringing') {
            if (mounted) setState(() => activeCall = data);
          } else if (data['type'] == 'call.state' && data['state'] == 'ended') {
            if (mounted) setState(() => activeCall = null);
          }
        } catch (_) {}
      }, onError: (_) {
        if (mounted) setState(() => notice = '실시간 연결 재시도 중...');
      });
    } catch (_) {}
  }

  Future<void> _find() async {
    _do(() async {
      final x = await api.call('/api/v1/users?search=${Uri.encodeQueryComponent(search.text)}');
      if (mounted) setState(() => results = x['users'] ?? []);
    });
  }

  Future<void> _friend(String id) async {
    _do(() async {
      await api.call('/api/v1/friends', method: 'POST', data: {'friend_id': id});
      setState(() => notice = '친구를 추가했습니다.');
      await _reload();
    });
  }

  Future<void> _openChat(String id, String title) async {
    _do(() async {
      selectedId = id;
      selectedTitle = title;
      replyToId = '';
      editingMsgId = '';
      final resultsList = await Future.wait([
        api.call('/api/v1/conversations/$id/messages'),
        api.call('/api/v1/conversations/$id/pins').catchError((_) => <String, dynamic>{'pins': []}),
        api.call('/api/v1/conversations/$id/notes').catchError((_) => <String, dynamic>{'notes': []}),
        api.call('/api/v1/conversations/$id/events').catchError((_) => <String, dynamic>{'events': []}),
        api.call('/api/v1/conversations/$id/polls').catchError((_) => <String, dynamic>{'polls': []}),
      ]);
      if (mounted) {
        setState(() {
          messages = resultsList[0]['messages'] ?? [];
          pins = resultsList[1]['pins'] ?? [];
          notes = resultsList[2]['notes'] ?? [];
          events = resultsList[3]['events'] ?? [];
          polls = resultsList[4]['polls'] ?? [];
        });
      }
      if (messages.isNotEmpty) {
        await api.call('/api/v1/conversations/$id/read', method: 'POST', data: {'sequence': messages.last['sequence']});
        await _reload();
      }
    });
  }

  Future<void> _syncOffline() async {
    if (selectedId.isEmpty) return;
    _do(() async {
      final lastSeq = messages.isNotEmpty ? messages.last['sequence'] : 0;
      final x = await api.call('/api/v1/conversations/$selectedId/sync?after_sequence=$lastSeq');
      final list = x['messages'] as List<dynamic>;
      if (mounted) {
        setState(() {
          for (final m in list) {
            if (!messages.any((old) => old['id'] == m['id'])) messages.add(m);
          }
          notice = '오프라인 메시지 ${list.length}건 동기화 완료';
        });
      }
      await _reload();
    });
  }

  Future<void> _startChat(String id, String title) async {
    _do(() async {
      final c = await api.call('/api/v1/conversations', method: 'POST', data: {
        'kind': 'direct',
        'member_ids': [id],
        'title': title,
      });
      await _openChat(c['id'], title);
      setState(() => currentTab = 1);
    });
  }

  Future<void> _startCall(String kind) async {
    if (selectedId.isEmpty) return;
    _do(() async {
      final res = await api.call('/api/v1/calls', method: 'POST', data: {
        'conversation_id': selectedId,
        'kind': kind,
        'sdp_offer': 'v=0\r\n',
      });
      setState(() => activeCall = res);
    });
  }

  Future<void> _endCall() async {
    if (activeCall == null) return;
    _do(() async {
      final callId = activeCall!['id'] ?? activeCall!['call_id'];
      await api.call('/api/v1/calls/$callId/state', method: 'POST', data: {'state': 'ended', 'end_reason': 'hangup'});
      setState(() => activeCall = null);
    });
  }

  String _uuid() {
    final r = Random.secure();
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    return bytes.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  }

  Future<void> _send({String kind = 'text', String? customBody}) async {
    if (selectedId.isEmpty) return;
    final text = customBody ?? message.text.trim();
    if (text.isEmpty) return;

    if (editingMsgId.isNotEmpty && customBody == null) {
      final targetId = editingMsgId;
      editingMsgId = '';
      message.clear();
      await _do(() async {
        await api.call('/api/v1/conversations/$selectedId/messages/$targetId', method: 'PATCH', data: {'body': text});
        for (final m in messages) {
          if (m['id'] == targetId) m['body'] = text;
        }
        setState(() => notice = '메시지를 수정했습니다.');
      });
      return;
    }

    final reply = replyToId;
    if (customBody == null) message.clear();
    replyToId = '';
    setState(() => showStickerPicker = false);
    await _do(() async {
      final x = await api.call('/api/v1/conversations/$selectedId/messages', method: 'POST', data: {
        'client_id': _uuid(),
        'kind': kind,
        'body': text,
        if (reply.isNotEmpty) 'reply_to': reply,
      });
      if (mounted) {
        setState(() {
          if (!messages.any((m) => m['id'] == x['message']['id'])) messages.add(x['message']);
        });
        await _reload();
      }
    });
  }

  Future<void> _translateMessage(String msgId, String text) async {
    if (translations.containsKey(msgId)) {
      setState(() => translations.remove(msgId));
      return;
    }
    setState(() {
      translations[msgId] = {'loading': true};
    });
    try {
      final res = await api.call('/api/v1/translate', method: 'POST', data: {
        'text': text,
        'target_lang': targetTranslateLang,
      });
      if (mounted) {
        setState(() {
          translations[msgId] = {
            'loading': false,
            'translated': res['translated'] ?? text,
            'target_lang': res['target_lang'] ?? targetTranslateLang,
            'engine': res['engine'] ?? 'LUNO-Edge-AI',
          };
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          translations[msgId] = {'loading': false, 'error': '번역 실패'};
        });
      }
    }
  }

  Future<void> _unsend(String msgId) async {
    _do(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId', method: 'DELETE');
      setState(() {
        messages.removeWhere((m) => m['id'] == msgId);
        notice = '메시지 전송을 취소했습니다.';
      });
    });
  }

  Future<void> _react(String msgId, String emoji) async {
    _do(() async {
      await api.call('/api/v1/conversations/$selectedId/messages/$msgId/reactions', method: 'POST', data: {'reaction': emoji});
      setState(() => notice = '$emoji 리액션을 남겼습니다.');
    });
  }

  Future<void> _pin(String msgId) async {
    _do(() async {
      await api.call('/api/v1/conversations/$selectedId/pins', method: 'POST', data: {'message_id': msgId});
      final p = await api.call('/api/v1/conversations/$selectedId/pins');
      setState(() {
        pins = p['pins'] ?? [];
        notice = '공지로 등록했습니다.';
      });
    });
  }

  Future<void> _saveToKeep(String msgId, String body) async {
    _do(() async {
      await api.call('/api/v1/bookmarks', method: 'POST', data: {'message_id': msgId, 'note': body});
      await _reload();
      setState(() => notice = 'LUNO Keep에 보관했습니다.');
    });
  }

  Future<void> _createFeedPost() async {
    if (feedInputCtrl.text.trim().isEmpty) return;
    _do(() async {
      await api.call('/api/v1/voom', method: 'POST', data: {'body': feedInputCtrl.text.trim()});
      feedInputCtrl.clear();
      await _reload();
      setState(() => notice = 'LUNO 피드 포스트를 게시했습니다.');
    });
  }

  Future<void> _likeFeed(String postId) async {
    _do(() async {
      await api.call('/api/v1/voom/$postId/like', method: 'POST');
      await _reload();
    });
  }

  Future<void> _chargeWallet() async {
    final amount = int.tryParse(payAmountCtrl.text.trim()) ?? 10000;
    _do(() async {
      await api.call('/api/v1/wallet/charge', method: 'POST', data: {'amount': amount});
      await _reload();
      setState(() => notice = 'LUNO Pay ₩$amount 충전 완료!');
    });
  }

  Future<void> _sendPayInChat() async {
    if (selectedId.isEmpty) return;
    _do(() async {
      await api.call('/api/v1/wallet/send', method: 'POST', data: {
        'conversation_id': selectedId,
        'amount': 10000,
        'title': '$selectedTitle 송금',
      });
      await _openChat(selectedId, selectedTitle);
      await _reload();
      setState(() => notice = 'LUNO Pay ₩10,000 송금을 완료했습니다.');
    });
  }

  Future<void> _exportGdprData() async {
    _do(() async {
      final res = await api.call('/api/v1/me/export-data');
      setState(() => notice = 'GDPR 데이터 백업 파일 생성 완료 (${res['stats']?['conversations_count'] ?? 0}개 대화)');
    });
  }

  Future<void> _logout() async {
    await wsSubscription?.cancel();
    await socket?.sink.close();
    await storage.delete(key: 'access_token');
    api.token = null;
    if (mounted) {
      setState(() {
        selfId = '';
        chats = [];
        friends = [];
        messages = [];
        selectedId = '';
        activeCall = null;
      });
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    search.dispose();
    message.dispose();
    qrChallenge.dispose();
    qrToken.dispose();
    groupTitle.dispose();
    statusMsgCtrl.dispose();
    feedInputCtrl.dispose();
    noteBodyCtrl.dispose();
    payAmountCtrl.dispose();
    wsSubscription?.cancel();
    socket?.sink.close();
    super.dispose();
  }

  // ==========================================================================
  // TAB 0: HOME / FRIENDS / ORBIT CREW
  // ==========================================================================
  Widget _buildHomeFriendsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: lunoLightBlue,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: lunoDeepBlue,
              foregroundColor: Colors.white,
              child: Text(selfName.isEmpty ? '나' : selfName.characters.first, style: const TextStyle(fontWeight: FontWeight.bold)),
            ),
            title: Text(selfName.isEmpty ? '내 프로필' : selfName, style: const TextStyle(fontWeight: FontWeight.bold, color: lunoNavy)),
            subtitle: Text(selfStatusMessage.isEmpty ? 'Connect Beyond Borders 🚀' : selfStatusMessage, style: const TextStyle(fontSize: 12, color: lunoSlateGray)),
            trailing: const Chip(
              label: Text('LUNO Keep', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: lunoDeepBlue)),
              backgroundColor: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: TextField(
              controller: search,
              decoration: InputDecoration(
                hintText: '이름 또는 @핸들로 LUNO 친구 검색',
                hintStyle: const TextStyle(fontSize: 13, color: lunoSlateGray),
                isDense: true,
                filled: true,
                fillColor: Colors.white,
                prefixIcon: const Icon(Icons.search, color: lunoDeepBlue),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: lunoMistGray)),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: lunoMistGray)),
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: lunoDeepBlue, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: _find,
            child: const Text('검색'),
          ),
        ]),
        ...results.map((u) => ListTile(
              title: Text('${u['display_name']}'),
              subtitle: Text('@${u['handle'] ?? ''}'),
              trailing: FilledButton.tonal(
                style: FilledButton.styleFrom(backgroundColor: lunoLightBlue, foregroundColor: lunoDeepBlue),
                onPressed: () => _friend(u['id']),
                child: const Text('친구 추가'),
              ),
            )),
        const SizedBox(height: 14),
        if (stories.isNotEmpty) ...[
          const Text('24시간 LUNO 스토리', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: lunoNavy)),
          const SizedBox(height: 8),
          SizedBox(
            height: 76,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: stories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, idx) {
                final s = stories[idx];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    border: Border.all(color: lunoPrimary, width: 1.5),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('${s['emoji'] ?? '✨'} ${s['author_name'] ?? '친구'}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: lunoNavy)),
                      Text('${s['text'] ?? ''}', style: const TextStyle(fontSize: 11, color: lunoSlateGray), overflow: TextOverflow.ellipsis),
                    ],
                  ),
                );
              },
            ),
          ),
          const Divider(height: 24, color: lunoMistGray),
        ],
        Text('공식 채널 (${officialAccounts.length})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: lunoNavy)),
        ...officialAccounts.map((oa) => ListTile(
              leading: CircleAvatar(backgroundColor: lunoLightBlue, child: Text('${oa['badge'] ?? 'LUNO'}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: lunoDeepBlue))),
              title: Text('${oa['display_name']} ✓', style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${oa['status_message'] ?? ''}', style: const TextStyle(fontSize: 12, color: lunoSlateGray)),
            )),
        const Divider(color: lunoMistGray),
        Text('친구 (${friends.length})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13, color: lunoNavy)),
        ...friends.map((u) => ListTile(
              leading: CircleAvatar(
                backgroundColor: lunoPrimary,
                child: Text('${u['display_name'] ?? 'U'}'.characters.first, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
              title: Text('${u['display_name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${u['status_message'] ?? '@${u['handle'] ?? ''}'}', style: const TextStyle(fontSize: 12, color: lunoSlateGray)),
              trailing: IconButton(icon: const Icon(Icons.chat_bubble_outline, color: lunoDeepBlue), onPressed: () => _startChat(u['id'], u['display_name'])),
              onTap: () => _startChat(u['id'], u['display_name']),
            )),
      ],
    );
  }

  // ==========================================================================
  // TAB 1: CHATS LIST
  // ==========================================================================
  Widget _buildChatsTab() {
    return ListView(
      padding: const EdgeInsets.all(10),
      children: [
        if (chats.isEmpty)
          const Padding(
            padding: EdgeInsets.all(32),
            child: Center(
              child: Text(
                '대화방이 없습니다.\n친구 탭에서 대화를 시작해보세요.',
                textAlign: TextAlign.center,
                style: TextStyle(color: lunoSlateGray, height: 1.5),
              ),
            ),
          ),
        ...chats.map((c) {
          final unread = c['unread_count'] ?? 0;
          final title = '${c['title']}'.isEmpty ? '대화방' : '${c['title']}';
          return Card(
            elevation: 0,
            margin: const EdgeInsets.symmetric(vertical: 4),
            color: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
              side: const BorderSide(color: lunoMistGray, width: 0.8),
            ),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: lunoPrimary,
                child: Text(title.characters.first, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
              ),
              title: Text(title, style: const TextStyle(fontWeight: FontWeight.bold, color: lunoNavy)),
              subtitle: Text('${c['last_message'] ?? '메시지를 입력해보세요'}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: lunoSlateGray, fontSize: 13)),
              trailing: unread > 0
                  ? CircleAvatar(
                      radius: 11,
                      backgroundColor: lunoDeepBlue,
                      child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
                    )
                  : const Icon(Icons.chevron_right, size: 20, color: lunoSlateGray),
              onTap: () => _openChat(c['id'], title),
            ),
          );
        }),
      ],
    );
  }

  // ==========================================================================
  // TAB 2: LUNO FEED / STORIES
  // ==========================================================================
  Widget _buildFeedTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: lunoMistGray)),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(children: [
              TextField(
                controller: feedInputCtrl,
                decoration: const InputDecoration(
                  hintText: 'LUNO 피드에 새로운 소식을 공유하세요...',
                  hintStyle: TextStyle(fontSize: 13, color: lunoSlateGray),
                  border: InputBorder.none,
                ),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: lunoDeepBlue),
                  onPressed: _createFeedPost,
                  icon: const Icon(Icons.send, size: 16),
                  label: const Text('피드 게시'),
                ),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        ...feedPosts.map((p) => Card(
              elevation: 0,
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: lunoMistGray)),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('${p['author']} ${p['handle'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold, color: lunoNavy)),
                    Text('${p['time'] ?? ''}', style: const TextStyle(fontSize: 11, color: lunoSlateGray)),
                  ]),
                  const SizedBox(height: 8),
                  Text('${p['body']}', style: const TextStyle(color: lunoNavy, height: 1.4)),
                  const SizedBox(height: 10),
                  Row(children: [
                    TextButton.icon(
                      onPressed: () => _likeFeed('${p['id']}'),
                      icon: Icon(p['liked'] == true ? Icons.favorite : Icons.favorite_border, color: Colors.red, size: 18),
                      label: Text('${p['likes'] ?? 0}'),
                    ),
                    const SizedBox(width: 8),
                    Text('💬 댓글 ${(p['comments'] as List?)?.length ?? 0}개', style: const TextStyle(fontSize: 12, color: lunoSlateGray)),
                  ]),
                ]),
              ),
            )),
      ],
    );
  }

  // ==========================================================================
  // TAB 3: OPEN LOUNGE & COMMUNITY
  // ==========================================================================
  Widget _buildOpenChatTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const Text('LUNO 글로벌 라운지 커뮤니티', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: lunoNavy)),
        const SizedBox(height: 8),
        ...openRooms.map((r) => Card(
              elevation: 0,
              color: Colors.white,
              margin: const EdgeInsets.only(bottom: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: lunoMistGray)),
              child: ListTile(
                leading: const CircleAvatar(backgroundColor: lunoLightBlue, child: Icon(Icons.forum, color: lunoDeepBlue)),
                title: Text('${r['title']}', style: const TextStyle(fontWeight: FontWeight.bold, color: lunoNavy)),
                subtitle: Text('${r['description'] ?? ''} · 참여자 ${r['member_count'] ?? 1}명', style: const TextStyle(fontSize: 12, color: lunoSlateGray)),
                trailing: const Chip(
                  label: Text('공개 라운지', style: TextStyle(color: lunoDeepBlue, fontSize: 11, fontWeight: FontWeight.bold)),
                  backgroundColor: lunoLightBlue,
                ),
              ),
            )),
      ],
    );
  }

  // ==========================================================================
  // TAB 4: LUNO WALLET & FINTECH
  // ==========================================================================
  Widget _buildWalletTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: lunoDeepBlue,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('LUNO Pay 머니 잔액', style: TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600)),
                  Icon(Icons.account_balance_wallet, color: lunoMint),
                ],
              ),
              const SizedBox(height: 6),
              Text('₩ $walletBalance', style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900)),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
                child: Text('LUNO POINTS: $walletPoints P', style: const TextStyle(color: lunoSky, fontSize: 12, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: payAmountCtrl,
                    keyboardType: TextInputType.number,
                    style: const TextStyle(color: lunoNavy, fontWeight: FontWeight.bold),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: Colors.white,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide.none),
                      hintText: '충전 금액',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: lunoMint, foregroundColor: lunoNavy),
                  onPressed: _chargeWallet,
                  child: const Text('+ 충전', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ]),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: lunoMistGray)),
          child: ListTile(
            leading: const Icon(Icons.security, color: lunoDeepBlue),
            title: const Text('간편 송금 & 결제 보호', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
            subtitle: const Text('24시간 이상거래 탐지 FDS 및 종단간 암호화 적용', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
          ),
        ),
      ],
    );
  }

  // ==========================================================================
  // TAB 5: LUNO SETTINGS / AI TRANSLATION / SECURITY / GDPR
  // ==========================================================================
  Widget _buildSettingsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: lunoMistGray)),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(
                children: [
                  Icon(Icons.translate, color: lunoDeepBlue),
                  SizedBox(width: 8),
                  Text('LUNO AI 실시간 번역 설정', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: lunoNavy)),
                ],
              ),
              const SizedBox(height: 6),
              const Text('상대방의 외국어 메시지를 선택한 언어로 즉시 번역합니다.', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
              const SizedBox(height: 10),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('새 메시지 자동 번역', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                value: autoTranslate,
                activeColor: lunoDeepBlue,
                onChanged: (v) => setState(() => autoTranslate = v),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('기본 번역 대상 언어', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  DropdownButton<String>(
                    value: targetTranslateLang,
                    underline: const SizedBox(),
                    items: const [
                      DropdownMenuItem(value: 'ko', child: Text('한국어 (KO)')),
                      DropdownMenuItem(value: 'en', child: Text('English (EN)')),
                      DropdownMenuItem(value: 'th', child: Text('ไทย (TH)')),
                      DropdownMenuItem(value: 'ja', child: Text('日本語 (JA)')),
                      DropdownMenuItem(value: 'zh', child: Text('中文 (ZH)')),
                      DropdownMenuItem(value: 'es', child: Text('Español (ES)')),
                    ],
                    onChanged: (v) {
                      if (v != null) setState(() => targetTranslateLang = v);
                    },
                  ),
                ],
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: lunoMistGray)),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(
                children: [
                  Icon(Icons.qr_code_scanner, color: lunoDeepBlue),
                  SizedBox(width: 8),
                  Text('PC/웹 데스크톱 QR 로그인 승인', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: lunoNavy)),
                ],
              ),
              const SizedBox(height: 8),
              TextField(controller: qrChallenge, decoration: const InputDecoration(labelText: 'QR Challenge ID', isDense: true)),
              const SizedBox(height: 6),
              TextField(controller: qrToken, decoration: const InputDecoration(labelText: 'QR Token', isDense: true)),
              const SizedBox(height: 10),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: lunoDeepBlue),
                onPressed: _approveDesktopQR,
                child: const Text('데스크톱 승인 완료'),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: lunoMistGray)),
          child: Column(children: [
            SwitchListTile(
              title: const Text('Letter Sealing (종단간 E2EE)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              subtitle: const Text('Signal X3DH & Double Ratchet 암호화 활성화', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
              value: letterSealing,
              activeColor: lunoDeepBlue,
              onChanged: (v) => setState(() => letterSealing = v),
            ),
            const Divider(height: 1, color: lunoMistGray),
            ListTile(
              leading: const Icon(Icons.download, color: lunoDeepBlue),
              title: const Text('GDPR 데이터 아카이브 다운로드', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              subtitle: const Text('내 모든 메시지, 친구, 미디어 메타데이터 내보내기', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
              onTap: _exportGdprData,
            ),
          ]),
        ),
      ],
    );
  }

  // ==========================================================================
  // NEWS TAB (Screenshot 5 Reference Implementation)
  // ==========================================================================
  Widget _buildNewsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // Featured Hero News Card
        Card(
          clipBehavior: Clip.antiAlias,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          elevation: 2,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 180,
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Colors.blueGrey.shade900, Colors.black87],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                padding: const EdgeInsets.all(16),
                child: const Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '단독 "SKY 학벌 중시하는 서울, 삶의 질은 세계 113위"',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold, height: 1.3),
                    ),
                    SizedBox(height: 4),
                    Text('매일경제 · 10분 전', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        // Ad Banner (Screenshot 5)
        Card(
          elevation: 0,
          color: lunoCloudWhite,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: lunoMistGray)),
          child: const ListTile(
            dense: true,
            leading: Text('AD', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: lunoSlateGray)),
            title: Text('타협 없는 모바일 액션 · 몬스터헌터 아웃랜더스', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            subtitle: Text('사전 예약하기 >', style: TextStyle(fontSize: 11, color: lunoElectricBlue)),
            trailing: Icon(Icons.videogame_asset, color: lunoElectricBlue),
          ),
        ),
        const SizedBox(height: 12),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text('오늘의 인기 기사', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: lunoMistGray, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: const Text('1', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          title: const Text("시청자 콱 물었다...시청률 '12.9%' 인기 드라마", maxLines: 2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          subtitle: const Text('TV리포트 · 25분 전', style: TextStyle(fontSize: 11, color: lunoSlateGray)),
        ),
        const Divider(height: 1, color: lunoMistGray),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: lunoMistGray, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: const Text('2', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          title: const Text('김혜수, 故 최불암 빈소서 무릎 꿇고 조의... 깊은 애도', maxLines: 2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          subtitle: const Text('스포츠조선 · 40분 전', style: TextStyle(fontSize: 11, color: lunoSlateGray)),
        ),
        const Divider(height: 1, color: lunoMistGray),
        ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          leading: Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: lunoMistGray, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: const Text('3', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
          title: const Text('[단독] 차세대 AI 메신저 LUNO, 글로벌 500만 돌파', maxLines: 2, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          subtitle: const Text('전자신문 · 1시간 전', style: TextStyle(fontSize: 11, color: lunoSlateGray)),
        ),
      ],
    );
  }

  // ==========================================================================
  // CALLS TAB (Screenshot 3 Reference Implementation)
  // ==========================================================================
  Widget _buildCallsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 4, vertical: 8),
          child: Text('통화', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        ),
        ListTile(
          leading: const CircleAvatar(backgroundColor: lunoElectricBlue, child: Text('K', style: TextStyle(color: Colors.white))),
          title: const Row(
            children: [
              Text('K 🙏', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              SizedBox(width: 4),
              Text('(3)', style: TextStyle(fontSize: 13, color: lunoSlateGray)),
            ],
          ),
          subtitle: const Row(
            children: [
              Icon(Icons.call_received, size: 14, color: lunoSlateGray),
              SizedBox(width: 4),
              Text('화요일', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
            ],
          ),
          trailing: IconButton(
            icon: const Icon(Icons.phone, color: lunoSuccessGreen),
            onPressed: () => _startCall('voice'),
          ),
        ),
        const Divider(height: 1, color: lunoMistGray),
        ListTile(
          leading: const CircleAvatar(backgroundColor: lunoElectricBlue, child: Text('K', style: TextStyle(color: Colors.white))),
          title: const Row(
            children: [
              Text('K 🙏', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.red)),
              SizedBox(width: 4),
              Text('(2)', style: TextStyle(fontSize: 13, color: Colors.red)),
            ],
          ),
          subtitle: const Row(
            children: [
              Icon(Icons.call_missed, size: 14, color: Colors.red),
              SizedBox(width: 4),
              Text('화요일 · 부재중 전화', style: TextStyle(fontSize: 12, color: Colors.red)),
            ],
          ),
          trailing: IconButton(
            icon: const Icon(Icons.phone, color: lunoSuccessGreen),
            onPressed: () => _startCall('voice'),
          ),
        ),
        const Divider(height: 1, color: lunoMistGray),
        ListTile(
          leading: const CircleAvatar(backgroundColor: Colors.teal, child: Text('T', style: TextStyle(color: Colors.white))),
          title: const Text('tuk (2)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
          subtitle: const Row(
            children: [
              Icon(Icons.call_made, size: 14, color: lunoSlateGray),
              SizedBox(width: 4),
              Text('8. 24. · 통화시간 3:12', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
            ],
          ),
          trailing: IconButton(
            icon: const Icon(Icons.phone, color: lunoSuccessGreen),
            onPressed: () => _startCall('voice'),
          ),
        ),
      ],
    );
  }

  // ==========================================================================
  // ACTIVE CHAT VIEWPORT
  // ==========================================================================
  Widget _buildActiveChatRoom() {
    return Column(children: [
      Container(
        color: lunoDeepBlue,
        child: SafeArea(
          bottom: false,
          child: ListTile(
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white),
              onPressed: () => setState(() => selectedId = ''),
            ),
            title: Row(children: [
              Flexible(child: Text(selectedTitle, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
              if (letterSealing)
                const Padding(
                  padding: EdgeInsets.only(left: 6),
                  child: Icon(Icons.lock, size: 14, color: lunoMint),
                ),
            ]),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              IconButton(icon: const Icon(Icons.phone, color: Colors.white), onPressed: () => _startCall('voice')),
              IconButton(icon: const Icon(Icons.videocam, color: Colors.white), onPressed: () => _startCall('video')),
              IconButton(icon: const Icon(Icons.payments_outlined, color: Colors.white), onPressed: _sendPayInChat),
              IconButton(icon: const Icon(Icons.sync, color: Colors.white), onPressed: _syncOffline),
            ]),
          ),
        ),
      ),
      if (pins.isNotEmpty)
        Container(
          width: double.infinity,
          color: lunoLightBlue,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Row(children: [
            const Icon(Icons.campaign, size: 18, color: lunoDeepBlue),
            const SizedBox(width: 6),
            Expanded(child: Text('공지: ${pins.first['body'] ?? ''}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: lunoDeepBlue), overflow: TextOverflow.ellipsis)),
          ]),
        ),
      Expanded(
        child: Container(
          color: const Color(0xFFEFF4FA),
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: messages.length,
            itemBuilder: (context, i) {
              final m = messages[i];
              final mine = m['sender_id'] == selfId;
              final readCount = m['read_count'] ?? 0;
              final msgId = m['id'] ?? '';
              final trans = translations[msgId];

              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  constraints: const BoxConstraints(maxWidth: 300),
                  decoration: BoxDecoration(
                    color: mine ? lunoDeepBlue : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 4, offset: const Offset(0, 2)),
                    ],
                  ),
                  child: InkWell(
                    onLongPress: () => setState(() => replyToId = msgId),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Column(
                        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          if (m['reply_to'] != null && '${m['reply_to']}'.isNotEmpty)
                            Text(
                              '↩ ${m['reply_preview'] ?? '답장'}',
                              style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : lunoSlateGray),
                            ),
                          Text(
                            '${m['body']}',
                            style: TextStyle(
                              color: mine ? Colors.white : lunoNavy,
                              fontSize: m['kind'] == 'sticker' ? 24 : 14,
                              height: 1.35,
                            ),
                          ),
                          // Translation inline display
                          if (trans != null) ...[
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                color: mine ? Colors.white.withOpacity(0.18) : lunoLightBlue,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: trans['loading'] == true
                                  ? const Text('AI 번역 중...', style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic))
                                  : Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Row(mainAxisSize: MainAxisSize.min, children: [
                                          const Text('🌐 [LUNO AI] ', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: lunoMint)),
                                          Text('${trans['target_lang']?.toUpperCase()}', style: TextStyle(fontSize: 9, color: mine ? Colors.white70 : lunoSlateGray)),
                                        ]),
                                        const SizedBox(height: 2),
                                        Text('${trans['translated']}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: mine ? Colors.white : lunoNavy)),
                                      ],
                                    ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (readCount > 0)
                                Text('읽음 $readCount', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: mine ? lunoSky : lunoDeepBlue)),
                              if (m['edited_at'] != null && '${m['edited_at']}'.isNotEmpty)
                                Text('(수정됨)', style: TextStyle(fontSize: 9, color: mine ? Colors.white70 : lunoSlateGray)),
                              ...lunoReactions.take(3).map((emo) => InkWell(
                                    onTap: () => _react(m['id'], emo),
                                    child: Text(emo, style: const TextStyle(fontSize: 11)),
                                  )),
                              InkWell(
                                onTap: () => _translateMessage(msgId, '${m['body']}'),
                                child: Icon(Icons.translate, size: 13, color: mine ? Colors.white70 : lunoSlateGray),
                              ),
                              InkWell(
                                onTap: () => _pin(m['id']),
                                child: Icon(Icons.push_pin, size: 12, color: mine ? Colors.white70 : lunoSlateGray),
                              ),
                              InkWell(
                                onTap: () => _saveToKeep(m['id'], '${m['body']}'),
                                child: Icon(Icons.bookmark_border, size: 12, color: mine ? Colors.white70 : lunoSlateGray),
                              ),
                              if (mine)
                                InkWell(
                                  onTap: () => _unsend(m['id']),
                                  child: const Icon(Icons.delete_outline, size: 12, color: Colors.white70),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
      if (showStickerPicker)
        Container(
          height: 86,
          color: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: lunoOrbitCrewStickers
                .map((s) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: ActionChip(
                        backgroundColor: lunoLightBlue,
                        side: BorderSide.none,
                        label: Text('${s['emoji']} ${s['character']}'),
                        onPressed: () => _send(kind: 'sticker', customBody: '${s['emoji']} [${s['character']}]'),
                      ),
                    ))
                .toList(),
          ),
        ),
      if (replyToId.isNotEmpty)
        Container(
          color: lunoLightBlue,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('↩ 메시지 답장 작성 중...', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: lunoDeepBlue)),
              IconButton(icon: const Icon(Icons.close, size: 16, color: lunoDeepBlue), onPressed: () => setState(() => replyToId = '')),
            ],
          ),
        ),
      Container(
        color: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: SafeArea(
          child: Row(children: [
            IconButton(
              icon: const Icon(Icons.stars_rounded, color: lunoDeepBlue),
              onPressed: () => setState(() => showStickerPicker = !showStickerPicker),
            ),
            Expanded(
              child: TextField(
                controller: message,
                decoration: InputDecoration(
                  hintText: '메시지를 입력하세요 (LUNO AI 실시간 연결)',
                  hintStyle: const TextStyle(fontSize: 13, color: lunoSlateGray),
                  isDense: true,
                  filled: true,
                  fillColor: lunoBg,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: lunoMistGray)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(20), borderSide: const BorderSide(color: lunoMistGray)),
                ),
                onSubmitted: (_) => _send(),
              ),
            ),
            IconButton(
              onPressed: busy ? null : () => _send(),
              icon: const Icon(Icons.send_rounded, color: lunoDeepBlue),
            ),
          ]),
        ),
      ),
    ]);
  }

  // ==========================================================================
  // ROOT BUILD METHOD
  // ==========================================================================
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: lunoMint, borderRadius: BorderRadius.circular(6)),
            child: const Text('LUNO', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: lunoNavy)),
          ),
          const SizedBox(width: 8),
          const Text('Connect Beyond Borders', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
        ]),
        actions: [
          if (selfId.isNotEmpty) IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Column(children: [
        if (error.isNotEmpty)
          Container(
            color: Colors.red.shade100,
            padding: const EdgeInsets.all(8),
            width: double.infinity,
            child: Text(error, style: const TextStyle(color: Colors.red)),
          ),
        if (notice.isNotEmpty)
          Container(
            color: Colors.green.shade100,
            padding: const EdgeInsets.all(8),
            width: double.infinity,
            child: Text(notice, style: const TextStyle(color: Colors.green, fontWeight: FontWeight.w600)),
          ),
        if (activeCall != null)
          Container(
            color: lunoLightBlue,
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('LUNO ${activeCall!['kind'] == 'video' ? '영상' : '음성'}통화 연결 중', style: const TextStyle(fontWeight: FontWeight.bold, color: lunoDeepBlue)),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.red, foregroundColor: Colors.white),
                  onPressed: _endCall,
                  child: const Text('종료'),
                ),
              ],
            ),
          ),
        // AUTHENTICATION SCREEN
        if (selfId.isEmpty)
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                child: SizedBox(
                  width: 350,
                  child: Card(
                    elevation: 0,
                    color: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: const BorderSide(color: lunoMistGray),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(22),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        CircleAvatar(
                          radius: 30,
                          backgroundColor: lunoDeepBlue,
                          child: const Text('LUNO', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13)),
                        ),
                        const SizedBox(height: 10),
                        Text(register ? '회원가입' : '로그인', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: lunoNavy)),
                        const SizedBox(height: 4),
                        const Text('Connect Beyond Borders', style: TextStyle(fontSize: 12, color: lunoSlateGray)),
                        Container(
                          margin: const EdgeInsets.symmetric(vertical: 12),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(color: lunoLightBlue, borderRadius: BorderRadius.circular(10)),
                          child: const Text('💡 데모 계정: user@line.local / LineUser#2026!', style: TextStyle(fontSize: 12, color: lunoDeepBlue, fontWeight: FontWeight.bold)),
                        ),
                        TextField(controller: email, decoration: const InputDecoration(labelText: '이메일')),
                        if (register) TextField(controller: name, decoration: const InputDecoration(labelText: '표시 이름')),
                        TextField(
                          controller: password,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: '비밀번호 (12자 이상 권장)'),
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            style: FilledButton.styleFrom(backgroundColor: lunoDeepBlue, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
                            onPressed: busy ? null : _login,
                            child: Text(register ? '가입' : '로그인'),
                          ),
                        ),
                        TextButton(
                          onPressed: () => setState(() => register = !register),
                          child: Text(register ? '기존 계정으로 로그인' : '새 LUNO 계정 만들기', style: const TextStyle(color: lunoDeepBlue)),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        // AUTHENTICATED TABS (IA 4 Core Tabs: Home, Chats, News, Calls)
        if (selfId.isNotEmpty && selectedId.isEmpty)
          Expanded(
            child: IndexedStack(
              index: currentTab,
              children: [
                _buildHomeFriendsTab(),
                _buildChatsTab(),
                _buildNewsTab(),
                _buildCallsTab(),
                _buildWalletTab(),
                _buildSettingsTab(),
              ],
            ),
          ),
        // CHAT CONVERSATION VIEWPORT
        if (selfId.isNotEmpty && selectedId.isNotEmpty) Expanded(child: _buildActiveChatRoom()),
      ]),
      bottomNavigationBar: (selfId.isNotEmpty && selectedId.isEmpty)
          ? NavigationBar(
              selectedIndex: currentTab > 3 ? 0 : currentTab,
              onDestinationSelected: (idx) => setState(() => currentTab = idx),
              destinations: const [
                NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: '홈'),
                NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: '대화'),
                NavigationDestination(icon: Icon(Icons.newspaper_outlined), selectedIcon: Icon(Icons.newspaper), label: '뉴스'),
                NavigationDestination(icon: Icon(Icons.phone_outlined), selectedIcon: Icon(Icons.phone), label: '통화'),
              ],
            )
          : null,
    );
  }
}
