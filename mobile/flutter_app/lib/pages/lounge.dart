// Route: /lounge — open community rooms: list, create, join with a
// nickname, posts, likes. Room titles come from the server `name` key.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class LoungePage extends StatelessWidget {
  const LoungePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    if (session.roomId.isNotEmpty) {
      final room = session.openRooms
          .where((r) => r is Map && '${r['id']}' == session.roomId);
      final name = room.isEmpty
          ? '라운지'
          : '${room.first['name'] ?? '라운지'}';
      return _RoomPostsView(roomId: session.roomId, roomName: name);
    }
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '라운지', subtitle: 'LUNO 글로벌 라운지 커뮤니티'),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    const Spacer(),
                    FilledButton.tonalIcon(
                      onPressed: session.busy
                          ? null
                          : () => showDialog(
                                context: context,
                                builder: (_) => _CreateRoomDialog(
                                    onSave: session.createRoom),
                              ),
                      icon: const Icon(Icons.add, size: 18),
                      label: const Text('새 라운지'),
                    ),
                  ],
                ),
              ),
              for (final r in session.openRooms)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? HarborDark.surface
                        : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.card),
                      side: BorderSide(
                          color: Theme.of(context).brightness ==
                                  Brightness.dark
                              ? HarborDark.channel
                              : HarborLight.channel),
                    ),
                    child: ListTile(
                      leading: IdentityTile(
                        glyph: '${r['name'] ?? 'L'}',
                        color: Theme.of(context).brightness ==
                                Brightness.dark
                            ? HarborDark.harbor
                            : HarborLight.harbor,
                      ),
                      title: Text('${r['name'] ?? '라운지'}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700)),
                      subtitle: Text(
                          "${r['description'] ?? ''} · 참여 ${r['member_count'] ?? 1}명",
                          style: Theme.of(context).textTheme.bodySmall),
                      trailing: r['joined'] == true
                          ? const Icon(Icons.chevron_right)
                          : FilledButton.tonal(
                              onPressed: session.busy
                                  ? null
                                  : () => _joinDialog(context, r),
                              child: const Text('참여'),
                            ),
                      onTap: session.busy
                          ? null
                          : () {
                              if (r['joined'] == true) {
                                session.openRoom('${r['id']}');
                              } else {
                                _joinDialog(context, r);
                              }
                            },
                    ),
                  ),
                ),
              if (session.openRooms.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CrewBadge.mascot(),
                      const SizedBox(height: 12),
                      Text('개설된 라운지가 없습니다',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium),
                    ],
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _joinDialog(BuildContext context, dynamic room) {
    final session = SessionScope.of(context, listen: false);
    final nick = TextEditingController(text: session.selfName);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${room['name'] ?? '라운지'} 참여'),
        content: TextField(
          controller: nick,
          decoration: const InputDecoration(
              labelText: '쓸 닉네임', isDense: true),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('취소')),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              session.joinRoom('${room['id']}', nick.text);
            },
            child: const Text('참여하기'),
          ),
        ],
      ),
    ).then((_) => nick.dispose());
  }
}

class _RoomPostsView extends StatefulWidget {
  final String roomId;
  final String roomName;
  const _RoomPostsView({required this.roomId, required this.roomName});

  @override
  State<_RoomPostsView> createState() => _RoomPostsViewState();
}

class _RoomPostsViewState extends State<_RoomPostsView> {
  final composer = TextEditingController();

  @override
  void dispose() {
    composer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      children: [
        Container(
          color: dark ? HarborDark.surface : HarborLight.harbor,
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
              child: Row(
                children: [
                  IconButton(
                    tooltip: '라운지 목록',
                    icon: Icon(Icons.arrow_back,
                        color: dark ? HarborDark.ink : Colors.white),
                    onPressed: session.closeRoom,
                  ),
                  Expanded(
                    child: Text(widget.roomName,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: dark ? HarborDark.ink : Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 15)),
                  ),
                  TextButton(
                    onPressed: session.busy
                        ? null
                        : () => session.leaveRoom(widget.roomId),
                    child: Text('나가기',
                        style: TextStyle(
                            color: dark
                                ? HarborDark.ink
                                : Colors.white)),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (session.roomNickname.isNotEmpty)
          Container(
            width: double.infinity,
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Text('내 닉네임: ${session.roomNickname}',
                style: TextStyle(
                    fontSize: 11,
                    color: dark ? HarborDark.ink : HarborLight.harbor)),
          ),
        Expanded(
          child: session.roomPosts.isEmpty
              ? Center(
                  child: Text('아직 글이 없습니다. 첫 글을 올려보세요.',
                      style:
                          Theme.of(context).textTheme.titleMedium),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: session.roomPosts.length,
                  itemBuilder: (_, i) {
                    final p = session.roomPosts[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Card(
                        color: dark ? HarborDark.surface : Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(HarborRadius.card),
                          side: BorderSide(
                              color: dark
                                  ? HarborDark.channel
                                  : HarborLight.channel),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                        '${p['author_name'] ?? ''}',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700,
                                            fontSize: 13)),
                                  ),
                                  Text('${p['created_at'] ?? ''}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Text('${p['body'] ?? ''}',
                                  style: const TextStyle(height: 1.4)),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Spacer(),
                                  IconButton(
                                    tooltip: p['liked'] == true
                                        ? '좋아요 취소'
                                        : '좋아요',
                                    iconSize: 18,
                                    onPressed: session.busy
                                        ? null
                                        : () => session.likeRoomPost(
                                            widget.roomId,
                                            '${p['id']}'),
                                    icon: Icon(
                                      p['liked'] == true
                                          ? Icons.favorite
                                          : Icons.favorite_border,
                                      color: p['liked'] == true
                                          ? Colors.redAccent
                                          : null,
                                    ),
                                  ),
                                  Text('${p['likes'] ?? 0}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
        Container(
          color: dark ? HarborDark.surface : Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: SafeArea(
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: composer,
                    minLines: 1,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: '라운지에 글쓰기',
                      isDense: true,
                    ),
                    onSubmitted: (_) => _send(session),
                  ),
                ),
                IconButton(
                  tooltip: '올리기',
                  onPressed: session.busy ? null : () => _send(session),
                  icon: Icon(Icons.send_rounded,
                      color: dark
                          ? HarborDark.harbor
                          : HarborLight.harbor),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _send(SessionController session) {
    final text = composer.text;
    if (text.trim().isEmpty) return;
    composer.clear();
    session.postRoom(widget.roomId, text);
  }
}

class _CreateRoomDialog extends StatefulWidget {
  final Future<void> Function(
      {required String name, String description, String nickname}) onSave;
  const _CreateRoomDialog({required this.onSave});

  @override
  State<_CreateRoomDialog> createState() => _CreateRoomDialogState();
}

class _CreateRoomDialogState extends State<_CreateRoomDialog> {
  final name = TextEditingController();
  final description = TextEditingController();
  final nickname = TextEditingController();

  @override
  void dispose() {
    name.dispose();
    description.dispose();
    nickname.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('새 라운지'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: name,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '라운지 이름 (필수)', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: description,
              decoration: const InputDecoration(
                  labelText: '소개 (선택)', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: nickname,
              decoration: const InputDecoration(
                  labelText: '내 닉네임 (선택)', isDense: true)),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: name.text.trim().isEmpty
              ? null
              : () {
                  Navigator.of(context).pop();
                  widget.onSave(
                      name: name.text,
                      description: description.text,
                      nickname: nickname.text);
                },
          child: const Text('개설'),
        ),
      ],
    );
  }
}
