import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:web_socket_channel/web_socket_channel.dart';

const apiBase = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');
const storage = FlutterSecureStorage();
const lineGreen = Color(0xFF06C755);
const lineChatBg = Color(0xFF849EBF);

void main() => runApp(const MessengerApp());

class Api {
  String? token;
  Future<Map<String, dynamic>> call(String path, {String method = 'GET', Map<String, dynamic>? data}) async {
    final uri = Uri.parse('$apiBase$path');
    final headers = <String, String>{'Content-Type': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    late http.Response res;
    try {
      switch (method) {
        case 'POST':
          res = await http.post(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 12));
          break;
        case 'PUT':
          res = await http.put(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 12));
          break;
        case 'PATCH':
          res = await http.patch(uri, headers: headers, body: jsonEncode(data ?? {})).timeout(const Duration(seconds: 12));
          break;
        case 'DELETE':
          res = await http.delete(uri, headers: headers).timeout(const Duration(seconds: 12));
          break;
        default:
          res = await http.get(uri, headers: headers).timeout(const Duration(seconds: 12));
      }
    } catch (e) {
      throw Exception('Network failure: $e');
    }
    final parsed = jsonDecode(utf8.decode(res.bodyBytes));
    if (parsed is! Map<String, dynamic>) throw Exception('Invalid server response');
    if (res.statusCode < 200 || res.statusCode >= 300) throw Exception(parsed['error'] ?? 'HTTP ${res.statusCode}');
    return parsed;
  }
}

class MessengerApp extends StatelessWidget {
  const MessengerApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Global Messenger',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: lineGreen, primary: lineGreen),
          useMaterial3: true,
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
      voomInputCtrl = TextEditingController(),
      noteBodyCtrl = TextEditingController(),
      payAmountCtrl = TextEditingController(text: '10000');

  bool register = false, busy = false, letterSealing = true, showStickerPicker = false;
  int currentTab = 0; // 0: 홈, 1: 대화, 2: VOOM, 3: 오픈채팅, 4: 지갑
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
      voomPosts = [],
      stories = [],
      openRooms = [],
      bookmarks = [],
      walletHistory = [];
  Map<String, dynamic>? activeCall;
  WebSocketChannel? socket;
  StreamSubscription? wsSubscription;

  static const lineStickers = [
    {'id': 'brown_hi', 'emoji': '🐻👋', 'label': '안녕!'},
    {'id': 'cony_love', 'emoji': '🐰❤️', 'label': '최고야!'},
    {'id': 'sally_ok', 'emoji': '🐥👌', 'label': '오케이!'},
    {'id': 'choco_cheer', 'emoji': '🎀✨', 'label': '화이팅!'},
    {'id': 'moon_laugh', 'emoji': '🌕😂', 'label': 'ㅋㅋㅋ'},
    {'id': 'boss_bow', 'emoji': '🕴️🙇', 'label': '감사합니다'},
  ];

  static const lineReactions = ['❤️', '👍', '😂', '😮', '😢', '😡'];

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
        selfName = me['display_name'] ?? '';
        selfHandle = me['handle'] ?? '';
        selfStatusMessage = me['status_message'] ?? '';
        statusMsgCtrl.text = selfStatusMessage;
      });
      await _reload();
      await _connect();
    } catch (_) {
      await storage.delete(key: 'access_token');
      api.token = null;
    }
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
      if (mounted) setState(() => error = e.toString());
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
          notice = '계정을 생성했습니다. 로그인하세요.';
        });
        return;
      }
      final result = await api.call('/api/v1/auth/login', method: 'POST', data: {
        'email': email.text.trim(),
        'password': password.text,
        'platform': 'android',
        'device_name': 'LINE Android Client',
      });
      api.token = result['access_token'];
      await storage.write(key: 'access_token', value: api.token);
      final me = await api.call('/api/v1/me');
      if (mounted) {
        setState(() {
          selfId = me['id'] ?? '';
          selfName = me['display_name'] ?? '';
          selfHandle = me['handle'] ?? '';
          selfStatusMessage = me['status_message'] ?? '';
          statusMsgCtrl.text = selfStatusMessage;
        });
      }
      password.clear();
      await _reload();
      await _connect();
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
      setState(() => notice = 'PC QR 로그인을 승인했습니다.');
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
        voomPosts = resultsList[3]['posts'] ?? [];
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
    final ticket = await api.call('/api/v1/ws-ticket', method: 'POST');
    final wsBase = apiBase.startsWith('https:') ? apiBase.replaceFirst('https:', 'wss:') : apiBase.replaceFirst('http:', 'ws:');
    socket = WebSocketChannel.connect(Uri.parse('$wsBase/api/v1/ws?ticket=${Uri.encodeQueryComponent(ticket['ticket'])}'));
    wsSubscription = socket!.stream.listen((event) {
      try {
        final data = jsonDecode(event);
        if (data['type'] == 'message.created') {
          final item = data['message'];
          if (mounted) {
            setState(() {
              if (item['conversation_id'] == selectedId && !messages.any((m) => m['id'] == item['id'])) {
                messages.add(item);
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
      if (mounted) setState(() => notice = '실시간 연결 오류. 다시 로그인하면 재접속됩니다.');
    });
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
      setState(() => notice = 'Keep 메모에 보관했습니다.');
    });
  }

  Future<void> _createVoomPost() async {
    if (voomInputCtrl.text.trim().isEmpty) return;
    _do(() async {
      await api.call('/api/v1/voom', method: 'POST', data: {'body': voomInputCtrl.text.trim()});
      voomInputCtrl.clear();
      await _reload();
      setState(() => notice = 'VOOM 포스트를 게시했습니다.');
    });
  }

  Future<void> _likeVoom(String postId) async {
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
      setState(() => notice = 'LINE Pay ₩$amount 충전 완료!');
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
      setState(() => notice = 'LINE Pay ₩10,000 송금을 완료했습니다.');
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
    voomInputCtrl.dispose();
    noteBodyCtrl.dispose();
    payAmountCtrl.dispose();
    wsSubscription?.cancel();
    socket?.sink.close();
    super.dispose();
  }

  Widget _buildHomeFriendsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          elevation: 0,
          color: Colors.green.shade50,
          child: ListTile(
            leading: CircleAvatar(backgroundColor: lineGreen, child: Text(selfName.isEmpty ? '나' : selfName.characters.first, style: const TextStyle(color: Colors.white))),
            title: Text(selfName.isEmpty ? '내 프로필' : selfName, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text(selfStatusMessage.isEmpty ? '상태메시지를 설정해보세요' : selfStatusMessage),
            trailing: const Chip(label: Text('Keep 메모', style: TextStyle(fontSize: 11))),
          ),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: TextField(
              controller: search,
              decoration: const InputDecoration(
                hintText: '이름 또는 @아이디로 친구 검색',
                isDense: true,
                prefixIcon: Icon(Icons.search),
                border: OutlineInputBorder(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          FilledButton(onPressed: _find, child: const Text('검색')),
        ]),
        ...results.map((u) => ListTile(
              title: Text('${u['display_name']}'),
              subtitle: Text('@${u['handle'] ?? ''}'),
              trailing: FilledButton.tonal(onPressed: () => _friend(u['id']), child: const Text('친구 추가')),
            )),
        const SizedBox(height: 12),
        if (stories.isNotEmpty) ...[
          const Text('24시간 스토리', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          const SizedBox(height: 6),
          SizedBox(
            height: 76,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: stories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 10),
              itemBuilder: (_, idx) {
                final s = stories[idx];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    border: Border.all(color: lineGreen, width: 2),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('${s['emoji'] ?? '🌟'} ${s['author_name'] ?? '친구'}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                      Text('${s['text'] ?? ''}', style: const TextStyle(fontSize: 11), overflow: TextOverflow.ellipsis),
                    ],
                  ),
                );
              },
            ),
          ),
          const Divider(height: 24),
        ],
        Text('공식 계정 (${officialAccounts.length})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        ...officialAccounts.map((oa) => ListTile(
              leading: CircleAvatar(backgroundColor: Colors.green.shade100, child: Text('${oa['badge'] ?? 'OA'}', style: const TextStyle(fontSize: 11))),
              title: Text('${oa['display_name']} ✓'),
              subtitle: Text('${oa['status_message'] ?? ''}'),
            )),
        const Divider(),
        Text('친구 (${friends.length})', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        ...friends.map((u) => ListTile(
              leading: CircleAvatar(backgroundColor: lineGreen, child: Text('${u['display_name'] ?? 'U'}'.characters.first, style: const TextStyle(color: Colors.white))),
              title: Text('${u['display_name']}'),
              subtitle: Text('${u['status_message'] ?? '@${u['handle'] ?? ''}'}'),
              trailing: IconButton(icon: const Icon(Icons.chat_bubble_outline, color: lineGreen), onPressed: () => _startChat(u['id'], u['display_name'])),
              onTap: () => _startChat(u['id'], u['display_name']),
            )),
      ],
    );
  }

  Widget _buildChatsTab() {
    return ListView(
      padding: const EdgeInsets.all(10),
      children: [
        if (chats.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: Text('대화방이 없습니다. 홈 탭에서 친구와 대화를 시작해보세요.')),
          ),
        ...chats.map((c) {
          final unread = c['unread_count'] ?? 0;
          return ListTile(
            leading: CircleAvatar(
              backgroundColor: lineGreen,
              child: Text(('${c['title']}'.isEmpty ? '대화' : '${c['title']}').characters.first, style: const TextStyle(color: Colors.white)),
            ),
            title: Text('${c['title']}'.isEmpty ? '대화' : '${c['title']}', style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${c['last_message'] ?? '메시지를 주고받아보세요'}', maxLines: 1, overflow: TextOverflow.ellipsis),
            trailing: unread > 0
                ? CircleAvatar(radius: 11, backgroundColor: lineGreen, child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 11)))
                : const Icon(Icons.chevron_right, size: 18),
            onTap: () => _openChat(c['id'], c['title'] ?? '대화'),
          );
        }),
      ],
    );
  }

  Widget _buildVoomTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Column(children: [
              TextField(
                controller: voomInputCtrl,
                decoration: const InputDecoration(hintText: 'LINE VOOM에 새로운 소식을 공유하세요', border: InputBorder.none),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(onPressed: _createVoomPost, child: const Text('VOOM 게시')),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 8),
        ...voomPosts.map((p) => Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                    Text('${p['author']} ${p['handle'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Text('${p['time'] ?? ''}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                  ]),
                  const SizedBox(height: 8),
                  Text('${p['body']}'),
                  const SizedBox(height: 8),
                  Row(children: [
                    TextButton.icon(
                      onPressed: () => _likeVoom('${p['id']}'),
                      icon: Icon(p['liked'] == true ? Icons.favorite : Icons.favorite_border, color: Colors.red, size: 18),
                      label: Text('${p['likes'] ?? 0}'),
                    ),
                    Text('💬 댓글 ${(p['comments'] as List?)?.length ?? 0}개', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  ]),
                ]),
              ),
            )),
      ],
    );
  }

  Widget _buildOpenChatTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        const Text('LINE 오픈채팅 커뮤니티', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        const SizedBox(height: 8),
        ...openRooms.map((r) => Card(
              child: ListTile(
                leading: const CircleAvatar(backgroundColor: lineGreen, child: Icon(Icons.forum, color: Colors.white)),
                title: Text('${r['title']}', style: const TextStyle(fontWeight: FontWeight.bold)),
                subtitle: Text('${r['description'] ?? ''} · 참여 ${r['member_count'] ?? 1}명'),
                trailing: const Text('공개방', style: TextStyle(color: lineGreen, fontWeight: FontWeight.bold)),
              ),
            )),
      ],
    );
  }

  Widget _buildWalletAndSettingsTab() {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          color: lineGreen,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('LINE Pay 머니 잔액', style: TextStyle(color: Colors.white70, fontSize: 12)),
              const SizedBox(height: 4),
              Text('₩ $walletBalance', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 4),
              Text('LINE POINTS: $walletPoints P', style: const TextStyle(color: Colors.white, fontSize: 12)),
              const SizedBox(height: 12),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: payAmountCtrl,
                    style: const TextStyle(color: Colors.black87),
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: Colors.white,
                      isDense: true,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(onPressed: _chargeWallet, child: const Text('+ 충전')),
              ]),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('PC QR 로그인 승인 (모바일 인증)', style: TextStyle(fontWeight: FontWeight.bold)),
              TextField(controller: qrChallenge, decoration: const InputDecoration(labelText: 'QR Challenge ID')),
              TextField(controller: qrToken, decoration: const InputDecoration(labelText: 'QR Token')),
              const SizedBox(height: 8),
              FilledButton(onPressed: _approveDesktopQR, child: const Text('PC 로그인 승인')),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        SwitchListTile(
          title: const Text('Letter Sealing (E2EE 종단간 암호화)'),
          subtitle: const Text('Signal ECDH-P256 + AES-256-GCM 암호화 활성화'),
          value: letterSealing,
          onChanged: (v) => setState(() => letterSealing = v),
        ),
      ],
    );
  }

  Widget _buildActiveChatRoom() {
    return Column(children: [
      Container(
        color: lineChatBg,
        child: ListTile(
          leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: () => setState(() => selectedId = '')),
          title: Row(children: [
            Flexible(child: Text(selectedTitle, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis)),
            if (letterSealing)
              const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.lock, size: 14, color: Colors.white70),
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
      if (pins.isNotEmpty)
        Container(
          width: double.infinity,
          color: Colors.amber.shade50,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Text('📢 공지: ${pins.first['body'] ?? ''}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      Expanded(
        child: Container(
          color: lineChatBg,
          child: ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: messages.length,
            itemBuilder: (context, i) {
              final m = messages[i];
              final mine = m['sender_id'] == selfId;
              final readCount = m['read_count'] ?? 0;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.symmetric(vertical: 4),
                  constraints: const BoxConstraints(maxWidth: 290),
                  decoration: BoxDecoration(
                    color: mine ? lineGreen : Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: InkWell(
                    onLongPress: () => setState(() => replyToId = m['id'] ?? ''),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Column(
                        crossAxisAlignment: mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          if (m['reply_to'] != null && '${m['reply_to']}'.isNotEmpty)
                            Text(
                              '↩ ${m['reply_preview'] ?? '답장'}',
                              style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : Colors.black54),
                            ),
                          Text(
                            '${m['body']}',
                            style: TextStyle(color: mine ? Colors.white : Colors.black87, fontSize: m['kind'] == 'sticker' ? 22 : 14),
                          ),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              if (readCount > 0)
                                Text('읽음 $readCount', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: mine ? Colors.white : lineGreen)),
                              if (m['edited_at'] != null && '${m['edited_at']}'.isNotEmpty)
                                Text('(수정됨)', style: TextStyle(fontSize: 9, color: mine ? Colors.white70 : Colors.grey)),
                              ...lineReactions.take(3).map((emo) => InkWell(
                                    onTap: () => _react(m['id'], emo),
                                    child: Text(emo, style: const TextStyle(fontSize: 11)),
                                  )),
                              InkWell(
                                onTap: () => _pin(m['id']),
                                child: Icon(Icons.push_pin, size: 12, color: mine ? Colors.white70 : Colors.grey),
                              ),
                              InkWell(
                                onTap: () => _saveToKeep(m['id'], '${m['body']}'),
                                child: Icon(Icons.bookmark_border, size: 12, color: mine ? Colors.white70 : Colors.grey),
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
          height: 82,
          color: Colors.grey.shade100,
          padding: const EdgeInsets.all(8),
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: lineStickers
                .map((s) => Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: ActionChip(
                        label: Text('${s['emoji']} ${s['label']}'),
                        onPressed: () => _send(kind: 'sticker', customBody: '${s['emoji']} [${s['label']}]'),
                      ),
                    ))
                .toList(),
          ),
        ),
      if (replyToId.isNotEmpty)
        Container(
          color: Colors.grey.shade200,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('↩ 메시지 답장 중...', style: TextStyle(fontSize: 12)),
              IconButton(icon: const Icon(Icons.close, size: 16), onPressed: () => setState(() => replyToId = '')),
            ],
          ),
        ),
      Container(
        color: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(children: [
          IconButton(
            icon: const Icon(Icons.emoji_emotions_outlined, color: lineGreen),
            onPressed: () => setState(() => showStickerPicker = !showStickerPicker),
          ),
          Expanded(
            child: TextField(
              controller: message,
              decoration: const InputDecoration(
                hintText: '메시지를 입력하세요',
                isDense: true,
                border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(20))),
              ),
              onSubmitted: (_) => _send(),
            ),
          ),
          IconButton(onPressed: busy ? null : () => _send(), icon: const Icon(Icons.send, color: lineGreen)),
        ]),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: lineGreen,
        foregroundColor: Colors.white,
        title: const Text('Global Messenger', style: TextStyle(fontWeight: FontWeight.bold)),
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
            child: Text(notice, style: const TextStyle(color: Colors.green)),
          ),
        if (activeCall != null)
          Container(
            color: Colors.amber.shade100,
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('LINE ${activeCall!['kind'] == 'video' ? '영상' : '음성'}통화 연결 중'),
                ElevatedButton(onPressed: _endCall, child: const Text('종료')),
              ],
            ),
          ),
        if (selfId.isEmpty)
          Expanded(
            child: Center(
              child: SingleChildScrollView(
                child: SizedBox(
                  width: 350,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const CircleAvatar(
                          radius: 26,
                          backgroundColor: lineGreen,
                          child: Text('LINE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900)),
                        ),
                        const SizedBox(height: 8),
                        Text(register ? '회원가입' : '로그인', style: Theme.of(context).textTheme.titleLarge),
                        Container(
                          margin: const EdgeInsets.symmetric(vertical: 8),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                          child: const Text('💡 데모 계정: user@line.local / LineUser#2026!', style: TextStyle(fontSize: 12, color: Colors.green)),
                        ),
                        TextField(controller: email, decoration: const InputDecoration(labelText: '이메일')),
                        if (register) TextField(controller: name, decoration: const InputDecoration(labelText: '표시 이름')),
                        TextField(
                          controller: password,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: '비밀번호 (가입 시 12자 이상)'),
                        ),
                        const SizedBox(height: 12),
                        FilledButton(onPressed: busy ? null : _login, child: Text(register ? '가입' : '로그인')),
                        TextButton(
                          onPressed: () => setState(() => register = !register),
                          child: Text(register ? '로그인으로' : '새 계정 만들기'),
                        ),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
          ),
        if (selfId.isNotEmpty && selectedId.isEmpty)
          Expanded(
            child: IndexedStack(
              index: currentTab,
              children: [
                _buildHomeFriendsTab(),
                _buildChatsTab(),
                _buildVoomTab(),
                _buildOpenChatTab(),
                _buildWalletAndSettingsTab(),
              ],
            ),
          ),
        if (selfId.isNotEmpty && selectedId.isNotEmpty) Expanded(child: _buildActiveChatRoom()),
      ]),
      bottomNavigationBar: (selfId.isNotEmpty && selectedId.isEmpty)
          ? NavigationBar(
              selectedIndex: currentTab,
              onDestinationSelected: (idx) => setState(() => currentTab = idx),
              destinations: const [
                NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: '홈'),
                NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: '대화'),
                NavigationDestination(icon: Icon(Icons.play_circle_outline), selectedIcon: Icon(Icons.play_circle), label: 'VOOM'),
                NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: '오픈채팅'),
                NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: '지갑'),
              ],
            )
          : null,
    );
  }
}
