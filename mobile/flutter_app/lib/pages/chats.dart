// Route: /chats — talk list. Plain LINE-style rows (avatar, title,
// preview, time, unread badge), a search entry into /search, an
// unread-first sort toggle, and the working group dialog.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../widgets/no_pull_refresh.dart';
import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/chat_time.dart';
import '../util/channel_slot.dart';
import '../util/app_l10n.dart';

/// Renders the list preview for a conversation's last message.
/// The server sends an object ({id, kind, body, ...}); only the human
/// readable part is shown, never the raw map.
String previewOfLastMessage(dynamic last, [String locale = 'ko']) {
  final s = stringsFor(locale);
  if (last is Map) {
    final body = '${last['body'] ?? ''}';
    if (body.isNotEmpty && body != 'null') return body;
    switch ('${last['kind'] ?? ''}') {
      case 'call_status':
        return s.mvCall;
      case 'sticker':
        return s.mvSticker;
      case 'image':
        return s.camPhoto;
      case 'video':
        return s.camVideo;
      case 'file':
        return s.fileWord;
      case 'security_notice':
        return s.notifWord;
    }
    return s.chatsTypeHint;
  }
  final text = '$last';
  return (text.isEmpty || text == 'null') ? s.chatsTypeHint : text;
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
    return NoPullRefresh(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                title: context.l10n.navChats,
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: context.l10n.chatsUnreadFirst,
                      isSelected: unreadFirst,
                      icon: Icon(Icons.sort,
                          color: unreadFirst
                              ? (dark ? HarborDark.harbor : HarborLight.harbor)
                              : null),
                      onPressed: () =>
                          setState(() => unreadFirst = !unreadFirst),
                    ),
                    IconButton(
                      tooltip: context.l10n.gsJoinByLink,
                      icon: const Icon(Icons.link),
                      onPressed: () => _joinDialog(context),
                    ),
                    IconButton(
                      tooltip: context.l10n.chatsMakeGroup,
                      icon: const Icon(Icons.add_comment_outlined),
                      onPressed: () => _groupDialog(context),
                    ),
                  ],
                ),
              ),
              _SearchEntry(dark: dark),
              const SizedBox(height: 8),
              if (session.pendingShareText != null &&
                  session.pendingShareText!.isNotEmpty)
                const _ShareBanner(),
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
                Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CrewBadge.mascot(),
                        SizedBox(height: 12),
                        Text(
                          context.l10n.chatsEmpty,
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

  // F6: paste an invite link or raw token to join a group.
  void _joinDialog(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final input = TextEditingController();
    String tokenOf(String raw) {
      final t = raw.trim();
      final i = t.lastIndexOf('/invite/');
      final tail = i >= 0 ? t.substring(i + 8) : t;
      return tail.split(RegExp(r'[?#\s]')).first;
    }

    showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setDialog) => AlertDialog(
          title: Text(context.l10n.gsJoinByLink),
          content: TextField(
            controller: input,
            autofocus: true,
            onChanged: (_) => setDialog(() {}),
            decoration: InputDecoration(
                labelText: context.l10n.chatsInviteLinkOrToken, isDense: true),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(dialog).pop(),
                child: Text(context.l10n.mvCancel)),
            FilledButton(
              onPressed: tokenOf(input.text).isEmpty
                  ? null
                  : () async {
                      final id =
                          await session.joinGroup(tokenOf(input.text));
                      if (!dialog.mounted) return;
                      Navigator.of(dialog).pop();
                      if (id != null && id.isNotEmpty && context.mounted) {
                        context.go('/chats/$id');
                      }
                    },
              child: Text(context.l10n.gsJoin),
            ),
          ],
        ),
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
          title: Text(context.l10n.chatsMakeGroup),
          content: SizedBox(
            width: 320,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: title,
                    decoration: InputDecoration(
                        labelText: context.l10n.mvGroupName, isDense: true),
                    onChanged: (_) => setDialog(() {})),
                const SizedBox(height: 8),
                if (session.friends.isEmpty)
                  Text(context.l10n.chatsNoFriends),
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
                child: Text(context.l10n.mvCancel)),
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
              child: Text(context.l10n.createWord),
            ),
          ],
        ),
      ),
    );
  }
}

// F21: inbound shares wait here until the user picks a room, whose
// composer consumes the text.
class _ShareBanner extends StatelessWidget {
  const _ShareBanner();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    return Card(
      child: ListTile(
        leading: const Icon(Icons.share_outlined),
        title: Text(context.l10n.shareBannerTitle),
        subtitle: Text(context.l10n.shareBannerDesc),
        trailing: IconButton(
          tooltip: context.l10n.mvCancel,
          icon: const Icon(Icons.close),
          onPressed: session.clearPendingShare,
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
              Text(context.l10n.chatsSearchHint,
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
    final title = raw.isEmpty ? context.l10n.mvChatFallback : raw;
    final memberCount = (c['member_count'] as num?)?.toInt();
    final countSuffix =
        (c['kind'] == 'group' && memberCount != null) ? ' ($memberCount)' : '';
    final last = c['last_message'];
    final session = SessionScope.of(context, listen: false);
    final rowTime = listTime(c['updated_at'] ?? (last is Map ? last['created_at'] : null), locale: session.locale);
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
                photo: session.photoOf(c['kind'] == 'direct'
                    ? (session.peerOf(c) ?? const {})['avatar_url']
                    : c['avatar_url']),
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
                    Text(previewOfLastMessage(c['last_message'], session.locale),
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