// Route: /chats — berth board (conversation list). Rooms are /chats/:id.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
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

class ChatsPage extends StatelessWidget {
  const ChatsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                title: '토크',
                subtitle: '정박 중인 대화방 ${session.chats.length}곳',
              ),
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
              if (session.chats.isEmpty)
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
              for (final c in session.chats)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _BerthCard(conversation: c, dark: dark),
                ),
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

class _BerthCard extends StatelessWidget {
  final dynamic conversation;
  final bool dark;
  const _BerthCard({required this.conversation, required this.dark});

  @override
  Widget build(BuildContext context) {
    final c = conversation;
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
    return Card(
      color: dark ? HarborDark.surface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        side: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        onTap: () => context.go('/chats/${c['id']}'),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              if (unread > 0) ...[
                const LampBar(height: 34),
                const SizedBox(width: 10),
              ],
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
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    const SizedBox(height: 2),
                    Text(previewOfLastMessage(c['last_message']),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
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
                              fontSize: 11,
                              color: dark
                                  ? HarborDark.drift
                                  : HarborLight.drift)),
                    ),
                  if (unread > 0)
                    Container(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: dark ? HarborDark.beacon : HarborLight.beacon,
                        borderRadius: BorderRadius.circular(HarborRadius.lamp),
                      ),
                      child: Text('$unread',
                          style: TextStyle(
                              color: dark
                                  ? HarborDark.onBeacon
                                  : HarborLight.onBeacon,
                              fontSize: 11,
                              fontWeight: FontWeight.w800)),
                    )
                  else
                    Icon(Icons.chevron_right,
                        size: 20,
                        color:
                            dark ? HarborDark.drift : HarborLight.drift),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

}
