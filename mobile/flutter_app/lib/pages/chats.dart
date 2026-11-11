// Route: /chats — talk list. Plain LINE-style rows (avatar, title,
// preview, time, unread badge), a search entry into /search, an
// unread-first sort toggle, and the working group dialog.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/chat_time.dart';
import '../util/channel_slot.dart';

/// Renders the list preview for a conversation's last message.
/// The server sends an object ({id, kind, body, ...}); only the human
/// readable part is shown, never the raw map.
String previewOfLastMessage(dynamic last) {
  if (last is Map) {
    final body = '${last['body'] ?? ''}';
    if (body.isNotEmpty && body != 'null') return body;
    switch ('${last['kind'] ?? ''}') {
      case 'call_status':
        return '통화';
      case 'sticker':
        return '스티커';
      case 'image':
        return '사진';
      case 'video':
        return '동영상';
      case 'file':
        return '파일';
      case 'security_notice':
        return '알림';
    }
    return '메시지를 입력해보세요';
  }
  final text = '$last';
  return (text.isEmpty || text == 'null') ? '메시지를 입력해보세요' : text;
}

class ChatsPage extends StatefulWidget {
  const ChatsPage({super.key});

  @override
  State<ChatsPage> createState() => _ChatsPageState();
}

class _ChatsPageState extends State<ChatsPage> {
  bool unreadFirst = false;

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final rooms = session.chats.whereType<Map<String, dynamic>>().toList();
    final ordered = unreadFirst
        ? [
            ...rooms.where((c) =>
                ((c['unread_count'] as num?)?.toInt() ?? 0) > 0),
            ...rooms.where((c) =>
                ((c['unread_count'] as num?)?.toInt() ?? 0) <= 0),
          ]
        : rooms;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '토크'),
              Row(
                children: [
                  Expanded(child: _SearchEntry(dark: dark)),
                  Material(
                    color: Colors.transparent,
                    child: IconButton(
                      tooltip: '안 읽은 방 먼저',
                      icon: Icon(
                        unreadFirst
                            ? Icons.sort
                            : Icons.sort_outlined,
                        color: unreadFirst
                            ? (dark
                                ? HarborDark.harbor
                                : HarborLight.harbor)
                            : (dark
                                ? HarborDark.drift
                                : HarborLight.drift),
                      ),
                      onPressed: () =>
                          setState(() => unreadFirst = !unreadFirst),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: () => _groupDialog(context),
                  icon: const Icon(Icons.group_add_outlined, size: 18),
                  label: const Text('그룹 만들기'),
                ),
              ),
              const SizedBox(height: 8),
              if (session.channelSlot != null &&
                  !session.dismissedChannelSlots
                      .contains(session.channelSlot!.id))
                ChannelSlotCard(
                  slot: session.channelSlot!,
                  dark: dark,
                  onDismiss: () =>
                      session.dismissChannelSlot(session.channelSlot!.id),
                ),
              if (ordered.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CrewBadge.mascot(),
                        SizedBox(height: 12),
                        Text(
                          '대화방이 없습니다.\n홈에서 친구를 찾아 대화를 시작해보세요.',
                          textAlign: TextAlign.center,
                          style: TextStyle(height: 1.5),
                        ),
                      ],
                    ),
                  ),
                ),
              for (var i = 0; i < ordered.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                _TalkRow(conversation: ordered[i]),
              ],
            ],
          ),
        ],
      ),
    );
  }

  void _groupDialog(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final title = TextEditingController();
    final picked = <String>{};
    showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setDialog) => AlertDialog(
          title: const Text('그룹 만들기'),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: title,
                    decoration: const InputDecoration(
                        labelText: '그룹 이름', isDense: true),
                    onChanged: (_) => setDialog(() {})),
                const SizedBox(height: 8),
                if (session.friends.isEmpty)
                  const Text('초대할 친구가 없습니다. 홈에서 친구를 먼저 추가하세요.'),
                if (session.friends.isNotEmpty)
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final f in session.friends)
                          if (f is Map)
                            CheckboxListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text('${f['display_name'] ?? ''}'),
                              value: picked.contains('${f['id']}'),
                              onChanged: (v) => setDialog(() {
                                final id = '${f['id']}';
                                if (v == true) {
                                  picked.add(id);
                                } else {
                                  picked.remove(id);
                                }
                              }),
                            ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(dialog).pop(),
                child: const Text('취소')),
            FilledButton(
              onPressed: title.text.trim().isEmpty || picked.isEmpty
                  ? null
                  : () async {
                      final id = await session.createGroup(
                          title.text, picked.toList());
                      if (!dialog.mounted) return;
                      Navigator.of(dialog).pop();
                      if (id != null && id.isNotEmpty && context.mounted) {
                        context.go('/chats/$id');
                      }
                    },
              child: const Text('만들기'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SearchEntry extends StatelessWidget {
  final bool dark;
  const _SearchEntry({required this.dark});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.go('/search'),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: dark ? HarborDark.chart : const Color(0xFFF1F3F4),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            children: [
              Icon(Icons.search,
                  size: 20,
                  color:
                      dark ? HarborDark.drift : HarborLight.drift),
              const SizedBox(width: 8),
              Text('대화·친구 검색',
                  style: TextStyle(
                      fontSize: 14,
                      color: dark
                          ? HarborDark.drift
                          : HarborLight.drift)),
            ],
          ),
        ),
      ),
    );
  }
}

class _TalkRow extends StatelessWidget {
  final Map<String, dynamic> conversation;
  const _TalkRow({required this.conversation});

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final unread = (c['unread_count'] as num?)?.toInt() ?? 0;
    final raw = '${c['title'] ?? ''}';
    final title = raw.isEmpty ? '대화방' : raw;
    final memberCount = (c['member_count'] as num?)?.toInt();
    final countSuffix =
        (c['kind'] == 'group' && memberCount != null) ? ' ($memberCount)' : '';
    final last = c['last_message'];
    final rowTime =
        listTime(c['updated_at'] ?? (last is Map ? last['created_at'] : null));
    final session = SessionScope.of(context, listen: false);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.go("/chats/${c['id']}"),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              IdentityTile(
                glyph: title,
                color: session.colorFromHex(
                    c['peer_color']?.toString(),
                    dark ? HarborDark.harbor : HarborLight.harbor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('$title$countSuffix',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: LunoType.listNameWeight,
                            fontSize: LunoType.listNameSize,
                            height: LunoType.listNameHeight)),
                    const SizedBox(height: 2),
                    Text(previewOfLastMessage(c['last_message']),
                        maxLines: LunoType.subMaxLines,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontWeight: LunoType.subWeight,
                            fontSize: LunoType.subSize,
                            color: dark
                                ? LunoDark.textSecondary
                                : LunoLight.textSecondary)),
                  ],
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (rowTime.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text(rowTime,
                          style: TextStyle(
                              fontSize: LunoType.stampSize,
                              fontWeight: LunoType.stampWeight,
                              height: LunoType.stampHeight,
                              fontFeatures: const [LunoType.tabular],
                              color: dark
                                  ? LunoDark.textMuted
                                  : LunoLight.textMuted)),
                    ),
                  if (unread > 0)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: dark ? HarborDark.beacon : HarborLight.beacon,
                        borderRadius:
                            BorderRadius.circular(HarborRadius.lamp),
                      ),
                      child: Text('$unread',
                          style: TextStyle(
                              color: dark
                                  ? HarborDark.onBeacon
                                  : HarborLight.onBeacon,
                              fontSize: LunoType.stampSize,
                              fontWeight: LunoType.stampWeight,
                              fontFeatures: const [LunoType.tabular])),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}