// Route: /chats/:cid — the vessel deck. Messages only; pins, notes,
// events and polls each have their own sub-route below this one.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../legacy_tokens.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/app_permissions.dart';
import '../util/attachments.dart';
import '../util/voice_recorder.dart';
import '../util/stickers.dart';
import '../util/sticker_image.dart';
import '../util/photo_effects.dart';
import '../util/inapp_camera.dart';
import '../util/video_bubble.dart';
import '../util/chat_time.dart';
import '../util/call_groups.dart';
import '../util/app_l10n.dart';
import '../widgets/pc_agent_bar.dart';

class ChatRoomPage extends StatefulWidget {
  final String conversationId;
  const ChatRoomPage({super.key, required this.conversationId});

  @override
  State<ChatRoomPage> createState() => _ChatRoomPageState();
}

class _ChatRoomPageState extends State<ChatRoomPage> {
  final message = TextEditingController();
  final _scroll = ScrollController();
  bool _opened = false;
  bool _showJump = false;

  void _watchScroll() {
    if (!_scroll.hasClients) return;
    final pos = _scroll.position;
    final show = (pos.maxScrollExtent - pos.pixels) > 200;
    if (show != _showJump && mounted) setState(() => _showJump = show);
  }

  void _jumpLatest() {
    if (!_scroll.hasClients) return;
    _scroll.animateTo(_scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_watchScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = SessionScope.of(context, listen: false);
      if (session.selectedId != widget.conversationId) {
        session.openChat(widget.conversationId);
      }
      final shared = session.consumeShareText();
      if (shared.isNotEmpty) message.text = shared;
      if (mounted) setState(() => _opened = true);
    });
  }

  @override
  void didUpdateWidget(covariant ChatRoomPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    // /chats/A -> /chats/B reuses this State; open the room that is now shown.
    if (oldWidget.conversationId != widget.conversationId) {
      final session = SessionScope.of(context, listen: false);
      if (session.selectedId != widget.conversationId) {
        session.openChat(widget.conversationId);
      }
    }
  }

  @override
  void dispose() {
    _scroll.dispose();
    message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final loading = !_opened || (session.selectedId == widget.conversationId && session.busy && session.messages.isEmpty);
    return Column(
      children: [
        _DeckHeader(conversationId: widget.conversationId),
        if (session.selectedId == widget.conversationId && session.pins.isNotEmpty)
          Container(
            width: double.infinity,
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: InkWell(
              onTap: () => context.go('/chats/${widget.conversationId}/pins'),
              child: Row(
                children: [
                  Icon(Icons.campaign,
                      size: 18, color: dark ? HarborDark.harbor : HarborLight.harbor),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(context.l10n.roomPinBody(session.pins.first['body'] ?? ''),
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: HarborType.small,
                            fontWeight: FontWeight.w700,
                            color: dark ? HarborDark.ink : HarborLight.harbor)),
                  ),
                ],
              ),
            ),
          ),
        if (session.autoTranslate)
          Container(
            width: double.infinity,
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Text(
                session.translateConfigured
                    ? context.l10n.roomAutoOnLang(session.targetTranslateLang.toUpperCase())
                    : context.l10n.roomAutoTranslateOn,
                style: TextStyle(
                    fontSize: HarborType.micro,
                    color: dark ? HarborDark.ink : HarborLight.harbor)),
          ),
        Expanded(
          child: Stack(
            children: [
              Container(
                color: LunoTheme.chatRoomBackgroundColor(
                dark ? Brightness.dark : Brightness.light),
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: session.messages.length,
                    itemBuilder: (_, i) {
                      final msg = session.messages[i];
                      final prev = i > 0 ? session.messages[i - 1] : null;
                      final next = i + 1 < session.messages.length
                          ? session.messages[i + 1]
                          : null;
                      final prevIso = prev == null ? null : prev['created_at'];
                      final lead = isGroupLead(prev, msg);
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (showDateDivider(prevIso, msg['created_at']))
                            _DateDivider(iso: msg['created_at']),
                          Padding(
                            padding: EdgeInsets.only(
                                top: lead
                                    ? LunoBubble.gapBreak
                                    : LunoBubble.gapInner),
                            child: _SignalBubble(
                              entry: msg,
                              groupLead: lead,
                              groupTail: isGroupTail(msg, next),
                              peerName: session.senderLabel(
                                  widget.conversationId, msg),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
              ),
              if (_showJump)
                Positioned(
                  right: 12,
                  bottom: 12,
                  child: Material(
                    color: dark ? HarborDark.surface : Colors.white,
                    borderRadius: BorderRadius.circular(HarborRadius.control),
                    elevation: 3,
                    child: InkWell(
                      key: const ValueKey('jump-latest'),
                      borderRadius: BorderRadius.circular(HarborRadius.control),
                      onTap: _jumpLatest,
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Icon(Icons.arrow_downward,
                            size: 20,
                            color: dark
                                ? HarborDark.harbor
                                : HarborLight.harbor),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        PcAgentBar(conversationId: widget.conversationId),
        if (session.showStickerPicker) const _StickerDeck(),
        if (session.replyToId.isNotEmpty)
          Container(
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Row(
              children: [
                // F25: let a scaled reply label shrink instead of
                // overflowing the row on a 360px phone.
                Expanded(
                  child: Text(context.l10n.roomReplying,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: HarborType.small,
                          fontWeight: FontWeight.w600,
                          color: dark ? HarborDark.ink : HarborLight.harbor)),
                ),
                IconButton(
                  tooltip: context.l10n.mvCancel,
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () =>
                      SessionScope.of(context, listen: false).setReply(''),
                ),
              ],
            ),
          ),
        _Composer(
          controller: message,
          onSend: () async {
            final text = message.text;
            if (await session.send(text: text)) message.clear();
          },
        ),
      ],
    );
  }
}

/// Long-press menu for one message: reactions on top, then every action
/// with a readable label (the bubble itself stays clean on small phones).
void _messageActions(BuildContext context, Map m, bool mine, String msgId) {
  final session = SessionScope.of(context, listen: false);
  final l = context.l10n;
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheet) {
      void run(VoidCallback action) {
        Navigator.of(sheet).pop();
        action();
      }

      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    for (final emo in lunoReactions)
                      InkResponse(
                        radius: 26,
                        onTap: () => run(() => session.react(m['id'], emo)),
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text(emo, style: const TextStyle(fontSize: 26)),
                        ),
                      ),
                  ],
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.reply),
                title: Text(l.roomReplyWord),
                onTap: () => run(() => session.setReply(msgId)),
              ),
              ListTile(
                leading: const Icon(Icons.translate),
                title: Text(l.actTranslate),
                onTap: () => run(() => session.translateMessage(msgId, '${m['body']}')),
              ),
              ListTile(
                leading: const Icon(Icons.forward_outlined),
                title: Text(l.actForward),
                onTap: () => run(() => _forwardRoomSheet(context, session, msgId)),
              ),
              ListTile(
                leading: const Icon(Icons.bookmark_border),
                title: Text(l.actKeep),
                onTap: () => run(() => session.saveToKeep(m['id'], '${m['body']}')),
              ),
              ListTile(
                leading: const Icon(Icons.push_pin_outlined),
                title: Text(l.actPin),
                onTap: () => run(() => session.pin(m['id'])),
              ),
              if (mine && m['kind'] == 'text')
                ListTile(
                  leading: const Icon(Icons.edit_outlined),
                  title: Text(l.roomEditTitle),
                  onTap: () => run(() => _editMessageDialog(context, session, msgId, '${m['body']}')),
                ),
              if (mine)
                ListTile(
                  leading: const Icon(Icons.undo),
                  title: Text(l.actUnsend),
                  onTap: () => run(() => session.unsend(m['id'])),
                ),
              ListTile(
                leading: const Icon(Icons.visibility_off_outlined),
                title: Text(l.actHide),
                onTap: () => run(() => session.hideMessage(msgId)),
              ),
            ],
          ),
        ),
      );
    },
  );
}

class _MenuRow extends StatelessWidget {
  final IconData icon;
  final String label;
  const _MenuRow(this.icon, this.label);

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Icon(icon, size: 20),
          const SizedBox(width: 12),
          Flexible(child: Text(label)),
        ],
      );
}

class _DeckHeader extends StatelessWidget {
  final String conversationId;
  const _DeckHeader({required this.conversationId});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: dark ? HarborDark.surface : HarborLight.harbor,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
          child: Row(
            children: [
              IconButton(
                tooltip: context.l10n.roomListTitle,
                icon: Icon(Icons.arrow_back,
                    color: dark ? HarborDark.ink : Colors.white),
                onPressed: () => context.go('/chats'),
              ),
              Expanded(
                child: Row(
                  children: [
                    Flexible(
                      child: Text(
                        session.selectedTitle.isEmpty
                            ? session.titleOf(conversationId)
                            : session.selectedTitle,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            color: dark ? HarborDark.ink : Colors.white,
                            fontWeight: LunoType.titleWeight,
                            fontSize: LunoType.titleSize,
                            height: LunoType.titleHeight),
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: context.l10n.callVoice,
                icon: Icon(Icons.phone, color: dark ? HarborDark.ink : Colors.white),
                onPressed: () => withPermissions(
                  context,
                  permissions: [
                    (Permission.microphone, context.l10n.permMicTitle, context.l10n.permMicUseVoice),
                  ],
                  action: () async => session.kindOf(conversationId) == 'group' ? session.joinGroupCall(conversationId, 'voice') : session.startCall('voice'),
                ),
              ),
              IconButton(
                tooltip: context.l10n.callVideo,
                icon: Icon(Icons.videocam, color: dark ? HarborDark.ink : Colors.white),
                onPressed: () => withPermissions(
                  context,
                  permissions: [
                    (Permission.microphone, context.l10n.permMicTitle, context.l10n.permCamUseVideo),
                    (Permission.camera, context.l10n.permCamTitle, context.l10n.permCamUseVideo),
                  ],
                  action: () async => session.kindOf(conversationId) == 'group' ? session.joinGroupCall(conversationId, 'video') : session.startCall('video'),
                ),
              ),
              // Everything past calls lives in one menu so the room name
              // keeps its width on a 360px phone.
              PopupMenuButton<String>(
                tooltip: context.l10n.mvMoreActions,
                icon: Icon(Icons.more_vert,
                    color: dark ? HarborDark.ink : Colors.white),
                onSelected: (value) {
                  switch (value) {
                    case 'pay':
                      session.sendPayInChat();
                    case 'approvals':
                      approvalsSheet(context, conversationId);
                    case 'sync':
                      session.syncOffline();
                    default:
                      context.go('/chats/$conversationId/$value');
                  }
                },
                itemBuilder: (_) => [
                  PopupMenuItem(value: 'pins', child: _MenuRow(Icons.campaign_outlined, context.l10n.gsNotice)),
                  PopupMenuItem(value: 'notes', child: _MenuRow(Icons.sticky_note_2_outlined, context.l10n.noteWord)),
                  PopupMenuItem(value: 'events', child: _MenuRow(Icons.event_outlined, context.l10n.scheduleWord)),
                  PopupMenuItem(value: 'polls', child: _MenuRow(Icons.how_to_vote_outlined, context.l10n.pollWord)),
                  PopupMenuItem(value: 'albums', child: _MenuRow(Icons.photo_library_outlined, context.l10n.albumWord)),
                  const PopupMenuDivider(),
                  PopupMenuItem(value: 'pay', child: _MenuRow(Icons.payments_outlined, context.l10n.mvSend)),
                  PopupMenuItem(value: 'approvals', child: _MenuRow(Icons.fact_check_outlined, context.l10n.apprTitle)),
                  PopupMenuItem(value: 'sync', child: _MenuRow(Icons.sync, context.l10n.roomOfflineSync)),
                  if (session.kindOf(conversationId) == 'group')
                    PopupMenuItem(value: 'settings', child: _MenuRow(Icons.settings_outlined, context.l10n.gsTitle)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ChatImage extends StatelessWidget {
  final String url;
  final String token;
  final String label;
  const _ChatImage({required this.url, required this.token, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: () => showDialog(
          context: context,
          builder: (_) => Dialog(
            insetPadding: const EdgeInsets.all(16),
            child: Image.network(url, headers: {'Authorization': 'Bearer $token'},
                errorBuilder: (_, __, ___) => Padding(
                    padding: EdgeInsets.all(24), child: Text(context.l10n.roomImageFail))),
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.network(url,
              headers: {'Authorization': 'Bearer $token'},
              height: 180,
              fit: BoxFit.cover,
              loadingBuilder: (ctx, child, progress) => progress == null
                  ? child
                  : const SizedBox(
                      height: 180, child: Center(child: CircularProgressIndicator())),
              errorBuilder: (_, __, ___) =>
                  Text(label, style: const TextStyle(fontSize: HarborType.small))),
        ),
      ),
    );
  }
}

// F8: one link card under a text bubble. First https URL only, hidden
// when the account switched previews off or the fetch came back empty.
class _LinkPreviewCard extends StatefulWidget {
  final String text;
  const _LinkPreviewCard({required this.text});

  @override
  State<_LinkPreviewCard> createState() => _LinkPreviewCardState();
}

class _LinkPreviewCardState extends State<_LinkPreviewCard> {
  Map<String, dynamic>? _pv;
  bool _done = false;

  String _firstUrl(String s) {
    final m = RegExp('https://[^\\s<>"\']+').firstMatch(s);
    if (m == null) {
      return '';
    }
    return m.group(0)!.replaceAll(RegExp(r'[.,!?;:)\]]+$'), '');
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final session = SessionScope.of(context, listen: false);
      final url = _firstUrl(widget.text);
      final pv = url.isEmpty ? null : await session.loadLinkPreview(url);
      if (mounted) {
        setState(() {
          _pv = pv;
          _done = true;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_done || _pv == null) return const SizedBox.shrink();
    final pv = _pv!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final img = '${pv['image_url'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: dark
            ? Colors.white.withValues(alpha: 0.08)
            : Colors.black.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(HarborRadius.control),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (img.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(HarborRadius.control),
              child: Image.network(img,
                  width: 64, height: 64, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      const SizedBox.shrink()),
            ),
          if (img.isNotEmpty) const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${pv['title']}',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: HarborType.small,
                        fontWeight: FontWeight.w700)),
                if ('${pv['description'] ?? ''}'.isNotEmpty)
                  Text('${pv['description']}',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: HarborType.micro)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// F9: location message card. Coordinates + label, display only.
class _LocationCard extends StatelessWidget {
  final dynamic meta;
  final Color ink;
  final Color faint;
  const _LocationCard(
      {required this.meta, required this.ink, required this.faint});

  @override
  Widget build(BuildContext context) {
    final lat = meta is Map ? '${meta['lat'] ?? ''}' : '';
    final lng = meta is Map ? '${meta['lng'] ?? ''}' : '';
    final label =
        meta is Map ? '${meta['label'] ?? ''}' : '';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.location_on_outlined, size: 28, color: ink),
        const SizedBox(width: 8),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.isEmpty ? context.l10n.mvLocationShare : label,
                  style: TextStyle(
                      color: ink,
                      fontSize: HarborType.small,
                      fontWeight: FontWeight.w700)),
              Text('$lat, $lng',
                  style: TextStyle(
                      color: faint, fontSize: HarborType.micro)),
            ],
          ),
        ),
      ],
    );
  }
}

// F9: contact message card. Shared friend id/handle/name, display only.
class _ContactCard extends StatelessWidget {
  final dynamic meta;
  final Color ink;
  final Color faint;
  const _ContactCard(
      {required this.meta, required this.ink, required this.faint});

  @override
  Widget build(BuildContext context) {
    final name =
        meta is Map ? '${meta['display_name'] ?? ''}' : '';
    final handle = meta is Map ? '${meta['handle'] ?? ''}' : '';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          backgroundColor: faint.withValues(alpha: 0.3),
          child: Text(name.isEmpty ? '?' : name.characters.first,
              style: TextStyle(color: ink)),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name.isEmpty ? context.l10n.contactWord : name,
                  style: TextStyle(
                      color: ink,
                      fontSize: HarborType.small,
                      fontWeight: FontWeight.w700)),
              if (handle.isNotEmpty)
                Text('@$handle',
                    style: TextStyle(
                        color: faint, fontSize: HarborType.micro)),
            ],
          ),
        ),
      ],
    );
  }
}

class _DateDivider extends StatelessWidget {
  final dynamic iso;
  const _DateDivider({required this.iso});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final label = dividerLabel(iso, locale: appLocaleOf(context));
    if (label.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: dark
                ? HarborDark.seaGlass
                : Colors.white.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(HarborRadius.lamp),
          ),
          child: Text(label,
              style: TextStyle(
                  fontSize: HarborType.micro,
                  fontWeight: FontWeight.w600,
                  color: dark ? HarborDark.drift : HarborLight.drift)),
        ),
      ),
    );
  }
}

class _SignalBubble extends StatelessWidget {
  final dynamic entry;
  final bool groupLead;
  final bool groupTail;
  final String peerName;
  const _SignalBubble(
      {required this.entry,
      this.groupLead = true,
      this.groupTail = true,
      this.peerName = ''});

  @override
  Widget build(BuildContext context) {
    if (entry is Map<String, dynamic> &&
        entry['kind'] == 'call_status') {
      return _CallBubble(
        entry: entry,
        groupLead: groupLead,
        groupTail: groupTail,
        peerName: peerName,
      );
    }
    if (entry is Map<String, dynamic> &&
        entry['kind'] == 'security_notice') {
      return _SecurityNoticeCard(
        entry: entry,
        groupLead: groupLead,
        groupTail: groupTail,
        peerName: peerName,
      );
    }
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final m = entry;
    final mine = m['sender_id'] == session.selfId;
    final readCount = (m['read_count'] as num?)?.toInt() ?? 0;
    final msgId = '${m['id'] ?? ''}';
    final trans = session.translations[msgId];
    // L-05: proposal decision affordances for privileged members.
    Map<String, dynamic>? decideRoom;
    for (final c in session.chats) {
      if (c is Map && '${c['id']}' == session.selectedId) {
        decideRoom = Map<String, dynamic>.from(c);
      }
    }
    final canDecide = session.canDecideIn(decideRoom);
    final proposalState = session.proposalState(msgId);
    final bubble = mine
        ? (dark ? LunoDark.bubbleMineBg : LunoLight.bubbleMineBg)
        : (dark ? LunoDark.bubbleTheirsBg : LunoLight.bubbleTheirsBg);
    final ink = mine
        ? (dark ? LunoDark.bubbleMineText : LunoLight.bubbleMineText)
        : (dark ? LunoDark.bubbleTheirsText : LunoLight.bubbleTheirsText);
    final faint = mine
        ? Colors.white.withValues(alpha: 0.75)
        : (dark ? HarborDark.drift : HarborLight.drift);
    final time = groupTail ? bubbleTime(m['created_at'], session.locale) : '';
    final screenW = MediaQuery.sizeOf(context).width;
    final kind = DeviceScope.of(context);
    final wide = kind == DeviceKind.tablet || kind == DeviceKind.desktop;
    final maxW = math.min(screenW * LunoBubble.maxWidthMobileFraction,
        wide ? LunoBubble.maxWidthDesktop : double.infinity);
    final muted = dark ? LunoDark.textMuted : LunoLight.textMuted;
    final timeStyle = TextStyle(
        fontSize: LunoType.stampSize,
        fontWeight: LunoType.stampWeight,
        height: LunoType.stampHeight,
        fontFeatures: const [LunoType.tabular],
        color: muted);
    final bubbleBody = Container(
        constraints: BoxConstraints(maxWidth: maxW),
        decoration: BoxDecoration(
          color: bubble,
          borderRadius: mine ? LunoBubble.mine : LunoBubble.theirs,
        ),
        child: InkWell(
          onLongPress: () => _messageActions(context, m, mine, msgId),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              crossAxisAlignment:
                  mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (m['reply_to'] != null && '${m['reply_to']}'.isNotEmpty)
                  Text('↩ ${m['reply_preview'] ?? context.l10n.roomReplyWord}',
                      style: TextStyle(fontSize: 10, color: faint)),
                if (m['metadata'] is Map && m['metadata']['forwarded'] == true)
                  Text(context.l10n.roomForwarded,
                      style: TextStyle(fontSize: 10, color: faint)),
                if (m['kind'] == 'image' && attachmentIdOf(m) != null)
                  _ChatImage(
                    url: attachmentContentUrl(
                        session.api.baseUrl, attachmentIdOf(m)!),
                    token: session.api.token ?? '',
                    label: '${m['body']}',
                  ),
                if (m['kind'] == 'video' && attachmentIdOf(m) != null)
                  VideoBubble(
                    url: attachmentContentUrl(
                        session.api.baseUrl, attachmentIdOf(m)!),
                    token: session.api.token ?? '',
                  ),
                if ((m['kind'] == 'voice' || m['kind'] == 'audio') && attachmentIdOf(m) != null)
                  VoiceBubble(
                    url: attachmentContentUrl(
                        session.api.baseUrl, attachmentIdOf(m)!),
                    token: session.api.token ?? '',
                    durationSec: voiceDurationOf(m) ?? 0,
                    foreground: ink,
                  ),
                if (m['kind'] == 'file' && attachmentIdOf(m) != null)
                  TextButton.icon(
                    onPressed: () => session.downloadAttachment(
                        attachmentIdOf(m)!, '${m['body']}'),
                    icon: Icon(Icons.download, size: 16, color: ink),
                    label: Text(context.l10n.mvSave,
                        style: TextStyle(color: ink, fontSize: HarborType.small)),
                  ),
                if (m['kind'] == 'location')
                  _LocationCard(meta: m['metadata'], ink: ink, faint: faint),
                if (m['kind'] == 'contact')
                  _ContactCard(meta: m['metadata'], ink: ink, faint: faint),
                // L-03: bot proposal/decision/report tag above the standard body.
                if (m['kind'] == 'proposal' || m['kind'] == 'decision' || m['kind'] == 'report')
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                        borderRadius: BorderRadius.circular(HarborRadius.lamp),
                      ),
                      child: Text(
                        m['kind'] == 'proposal' ? context.l10n.msgKindProposal : m['kind'] == 'decision' ? context.l10n.msgKindDecision : context.l10n.msgKindReport,
                        style: TextStyle(fontSize: HarborType.micro, fontWeight: FontWeight.w700, color: ink)),
                    ),
                  ),
                if (m['kind'] == 'proposal' && canDecide && proposalState == 'pending')
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        FilledButton(
                          onPressed: () => session.decideProposal(session.selectedId, msgId, 'approved'),
                          child: Text(context.l10n.mvApprove),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: () => session.decideProposal(session.selectedId, msgId, 'rejected'),
                          child: Text(context.l10n.apprReject),
                        ),
                      ],
                    ),
                  ),
                if (m['kind'] == 'proposal' && proposalState != 'pending')
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(proposalState == 'approved' ? context.l10n.apprApprovedState : context.l10n.apprRejectedState,
                        style: TextStyle(fontSize: HarborType.micro, fontWeight: FontWeight.w700, color: faint)),
                  ),
                if (m['kind'] == 'sticker' &&
                    isImageStickerId('${_stickerIdOf(m) ?? m['body']}'))
                  StickerImage(
                    stickerId: '${_stickerIdOf(m) ?? m['body']}',
                    baseUrl: session.api.baseUrl,
                    fallbackGlyph: stickerGlyph(
                        body: '${m['body']}', stickerId: _stickerIdOf(m)),
                  )
                else if (m['kind'] == 'sticker')
                  StickerBubble(
                    glyph: stickerGlyph(
                        body: '${m['body']}', stickerId: _stickerIdOf(m)),
                  )
                else
                  Text('${m['body']}',
                      style: TextStyle(
                          color: ink,
                          fontSize: LunoType.bubbleSize,
                          fontWeight: LunoType.bubbleWeight,
                          height: LunoType.bubbleHeight)),
                if (m['kind'] == 'text' && m['unsent'] != true)
                  _LinkPreviewCard(text: '${m['body']}'),
                if (trans != null) ...[
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: mine
                          ? Colors.white.withValues(alpha: 0.18)
                          : (dark ? HarborDark.seaGlass : HarborLight.seaGlass),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: trans['loading'] == true
                        ? Text(context.l10n.translating,
                            style: TextStyle(fontSize: HarborType.micro, fontStyle: FontStyle.italic))
                        : trans['error'] != null
                            ? Text('${trans['error']}',
                                style: TextStyle(fontSize: HarborType.micro, color: faint))
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text('${trans['target_lang']}'
                                          .toString()
                                          .toUpperCase()),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text('${trans['translated']}',
                                      style: TextStyle(
                                          fontSize: HarborType.small,
                                          fontWeight: FontWeight.w600,
                                          color: ink)),
                                ],
                              ),
                  ),
                ],
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (groupTail && readCount > 0)
                      Text(context.l10n.roomReadCount(readCount),
                          style: TextStyle(
                              fontSize: LunoType.stampSize,
                              fontWeight: LunoType.stampWeight,
                              fontFeatures: const [LunoType.tabular],
                              color: faint)),
                    if (m['edited_at'] != null && '${m['edited_at']}'.isNotEmpty)
                      Text(context.l10n.roomEdited, style: TextStyle(fontSize: 9, color: faint)),
                  ],
                ),
              ],
            ),
          ),
        ),
        );
    final avatar = !mine && groupLead
        ? Container(
            width: LunoBubble.avatarSize,
            height: LunoBubble.avatarSize,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: dark ? HarborDark.harbor : HarborLight.harbor,
            ),
            child: Text(peerName.isEmpty ? '?' : peerName.characters.first,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700)),
          )
        : const SizedBox(width: LunoBubble.continuedIndent);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) ...[
            avatar,
            const SizedBox(width: 8),
          ],
          if (mine && time.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 6, bottom: 6),
              child: Text(time, style: timeStyle),
            ),
          Flexible(
              child: Column(
            crossAxisAlignment:
                mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              if (!mine && groupLead && peerName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 2),
                  child: Text(peerName,
                      style: TextStyle(
                          fontSize: LunoType.stampSize,
                          fontWeight: LunoType.stampWeight,
                          color: dark
                              ? LunoDark.textSecondary
                              : LunoLight.textSecondary)),
                ),
              bubbleBody,
            ],
          )),
          if (!mine && time.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 6, bottom: 6),
              child: Text(time, style: timeStyle),
            ),
        ],
      ),
    );
  }
}

/// System call record bubble (kind `call_status`, minted by the server):
/// phone icon + kind + duration, no action row, no reply target.
class _CallBubble extends StatelessWidget {
  final Map<String, dynamic> entry;
  final bool groupLead;
  final bool groupTail;
  final String peerName;
  const _CallBubble(
      {required this.entry,
      this.groupLead = true,
      this.groupTail = true,
      this.peerName = ''});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final m = entry;
    final mine = m['sender_id'] == session.selfId;
    final bubble = mine
        ? (dark ? LunoDark.bubbleMineBg : LunoLight.bubbleMineBg)
        : (dark ? LunoDark.bubbleTheirsBg : LunoLight.bubbleTheirsBg);
    final ink = mine
        ? (dark ? LunoDark.bubbleMineText : LunoLight.bubbleMineText)
        : (dark ? LunoDark.bubbleTheirsText : LunoLight.bubbleTheirsText);
    final faint = mine
        ? Colors.white.withValues(alpha: 0.75)
        : (dark ? HarborDark.drift : HarborLight.drift);
    final time = groupTail ? bubbleTime(m['created_at'], session.locale) : '';
    final muted = dark ? LunoDark.textMuted : LunoLight.textMuted;
    final timeStyle = TextStyle(
        fontSize: LunoType.stampSize,
        fontWeight: LunoType.stampWeight,
        height: LunoType.stampHeight,
        fontFeatures: const [LunoType.tabular],
        color: muted);
    final meta = m['metadata'];
    final video = meta is Map && meta['call_type'] == 'video';
    final duration = callBubbleDuration(m);
    final avatar = !mine && groupLead
        ? Container(
            width: LunoBubble.avatarSize,
            height: LunoBubble.avatarSize,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: dark ? HarborDark.harbor : HarborLight.harbor,
            ),
            child: Text(peerName.isEmpty ? '?' : peerName.characters.first,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700)),
          )
        : const SizedBox(width: LunoBubble.continuedIndent);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine) ...[
            avatar,
            const SizedBox(width: 8),
          ],
          if (mine && time.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 6, bottom: 6),
              child: Text(time, style: timeStyle),
            ),
          Flexible(
              child: Column(
            crossAxisAlignment:
                mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
            children: [
              if (!mine && groupLead && peerName.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(left: 2, bottom: 2),
                  child: Text(peerName,
                      style: TextStyle(
                          fontSize: LunoType.stampSize,
                          fontWeight: LunoType.stampWeight,
                          color: dark
                              ? LunoDark.textSecondary
                              : LunoLight.textSecondary)),
                ),
              Container(
                decoration: BoxDecoration(
                  color: bubble,
                  borderRadius: mine ? LunoBubble.mine : LunoBubble.theirs,
                ),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: mine
                              ? Colors.white.withValues(alpha: 0.22)
                              : (dark
                                  ? HarborDark.seaGlass
                                  : HarborLight.seaGlass),
                        ),
                        child: Icon(video ? Icons.videocam : Icons.phone,
                            size: 20, color: ink),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(callBubbleTitle(m, session.locale),
                              style: TextStyle(
                                  color: ink,
                                  fontSize: HarborType.body,
                                  fontWeight: FontWeight.w700)),
                          if (duration.isNotEmpty)
                            Text(duration,
                                style: TextStyle(
                                    fontSize: 13,
                                    color: faint,
                                    fontFeatures: const [
                                      LunoType.tabular
                                    ])),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          )),
          if (!mine && time.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 6, bottom: 6),
              child: Text(time, style: timeStyle),
            ),
        ],
      ),
    );
  }
}

/// Server-minted login notice (kind `security_notice`): facts first, then
/// the two working responses — remote logout of the named session and
/// password change. Notices without a session_id (seed fixtures) omit the
/// logout button instead of calling an endpoint that would 400.
class _SecurityNoticeCard extends StatelessWidget {
  final Map<String, dynamic> entry;
  final bool groupLead;
  final bool groupTail;
  final String peerName;
  const _SecurityNoticeCard(
      {required this.entry,
      this.groupLead = true,
      this.groupTail = true,
      this.peerName = ''});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final m = entry;
    final meta = m['metadata'];
    final data = meta is Map<String, dynamic>
        ? meta
        : const <String, dynamic>{};
    final device = data['device']?.toString() ?? '';
    final ip = data['ip']?.toString() ?? '';
    final location = data['location']?.toString() ?? '';
    final sessionId = data['session_id']?.toString() ?? '';
    final sample = data['sample'] == true;
    final time = groupTail ? bubbleTime(m['created_at'], session.locale) : '';
    final muted = dark ? LunoDark.textMuted : LunoLight.textMuted;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final avatar = groupLead
        ? Container(
            width: LunoBubble.avatarSize,
            height: LunoBubble.avatarSize,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: dark ? HarborDark.harbor : HarborLight.harbor,
            ),
            child: Text(peerName.isEmpty ? '?' : peerName.characters.first,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700)),
          )
        : const SizedBox(width: LunoBubble.continuedIndent);
    return Align(
      alignment: Alignment.centerLeft,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          avatar,
          const SizedBox(width: 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (groupLead && peerName.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(left: 2, bottom: 2),
                    child: Text(peerName,
                        style: TextStyle(
                            fontSize: LunoType.stampSize,
                            fontWeight: LunoType.stampWeight,
                            color: sub)),
                  ),
                Container(
                  decoration: BoxDecoration(
                    color: dark
                        ? LunoDark.bubbleTheirsBg
                        : LunoLight.bubbleTheirsBg,
                    borderRadius: LunoBubble.theirs,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${m['body']}',
                            style: const TextStyle(
                                color: LunoStatus.online,
                                fontSize: 16,
                                fontWeight: FontWeight.w800)),
                        const Divider(height: 16),
                        if (device.isNotEmpty)
                          Text(context.l10n.roomLoginNotice(device),
                              style:
                                  TextStyle(fontSize: 13, color: ink)),
                        const SizedBox(height: 8),
                        Text(
                            context.l10n.roomSecurityAdvice,
                            style: TextStyle(fontSize: 13, color: ink)),
                        if (ip.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(context.l10n.roomIpAddr(ip),
                              style:
                                  TextStyle(fontSize: HarborType.small, color: sub)),
                        ],
                        if (location.isNotEmpty)
                          Text(context.l10n.roomLocation(location),
                              style:
                                  TextStyle(fontSize: HarborType.small, color: sub)),
                        if (sample)
                          Padding(
                            padding: const EdgeInsets.only(top: 6),
                            child: Text(context.l10n.sampleDataWord,
                                style: TextStyle(
                                    fontSize: HarborType.micro,
                                    fontStyle: FontStyle.italic,
                                    color: sub)),
                          ),
                        if (sessionId.isNotEmpty) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: FilledButton(
                              onPressed: () => session
                                  .revokeNoticeSession(sessionId),
                              child: Text(context.l10n.mvLogout),
                            ),
                          ),
                        ],
                        Center(
                          child: TextButton(
                            onPressed: () => _passwordDialog(context),
                            child: Text(context.l10n.mvRecoverReset),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (time.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 6, bottom: 6),
              child: Text(time,
                  style: TextStyle(
                      fontSize: LunoType.stampSize,
                      fontWeight: LunoType.stampWeight,
                      height: LunoType.stampHeight,
                      fontFeatures: const [LunoType.tabular],
                      color: muted)),
            ),
        ],
      ),
    );
  }
}

// F7: prefilled edit dialog for text messages.
Future<void> _editMessageDialog(BuildContext context,
    SessionController session, String msgId, String body) async {
  final controller = TextEditingController(text: body);
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(context.l10n.roomEditTitle),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 4,
          onChanged: (_) => setDialog(() {}),
          decoration:
              InputDecoration(labelText: context.l10n.messageWord, isDense: true),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed: controller.text.trim().isEmpty
                ? null
                : () {
                    Navigator.of(dialog).pop();
                    session.editMessage(msgId, controller.text);
                  },
            child: Text(context.l10n.mvSave),
          ),
        ],
      ),
    ),
  );
}

// F7: forward target picker. Official rooms are read-only, like the web.
Future<void> _forwardRoomSheet(BuildContext context,
    SessionController session, String msgId) async {
  final rooms = session.chats
      .where((c) => c is Map && c['official'] != true)
      .toList();
  await showModalBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: EdgeInsets.all(16),
            child: Text(context.l10n.mvForwardTo,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final c in rooms)
                  ListTile(
                    dense: true,
                    title: Text('${(c as Map)['title'] ?? context.l10n.mvChatFallback}'),
                    onTap: () {
                      Navigator.of(sheet).pop();
                      session.forwardMessage('${c['id']}', msgId);
                    },
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

// F9: location share dialog. Coordinates are typed (no location plugin),
// validated here and again by the server.
Future<void> _shareLocationDialog(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  final lat = TextEditingController();
  final lng = TextEditingController();
  final label = TextEditingController();
  bool valid() {
    final a = double.tryParse(lat.text.trim());
    final o = double.tryParse(lng.text.trim());
    return a != null && o != null && a.abs() <= 90 && o.abs() <= 180;
  }

  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(context.l10n.mvLocationShare),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: lat,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setDialog(() {}),
              decoration: InputDecoration(
                  labelText: context.l10n.roomLatHint, isDense: true),
            ),
            TextField(
              controller: lng,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setDialog(() {}),
              decoration: InputDecoration(
                  labelText: context.l10n.roomLonHint, isDense: true),
            ),
            TextField(
              controller: label,
              onChanged: (_) => setDialog(() {}),
              decoration: InputDecoration(
                  labelText: context.l10n.roomPlaceName, isDense: true),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed: !valid()
                ? null
                : () {
                    Navigator.of(dialog).pop();
                    session.sendLocation(
                      lat: double.parse(lat.text.trim()),
                      lng: double.parse(lng.text.trim()),
                      label: label.text,
                    );
                  },
            child: Text(context.l10n.shareWord),
          ),
        ],
      ),
    ),
  );
}

// F9: contact share sheet. Friends only; the card carries id/handle/name.
Future<void> _shareContactSheet(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  await showModalBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: EdgeInsets.all(16),
            child: Text(context.l10n.mvShareContact,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: [
                if (session.friends.isEmpty)
                  ListTile(title: Text(context.l10n.roomNoShareFriends)),
                for (final f in session.friends)
                  if (f is Map)
                    ListTile(
                      dense: true,
                      title: Text('${f['display_name'] ?? ''}'),
                      subtitle: Text('@${f['handle'] ?? ''}'),
                      onTap: () {
                        Navigator.of(sheet).pop();
                        session.sendContact(
                            Map<String, dynamic>.from(f));
                      },
                    ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

// L-05: approval box bottom sheet. Lists the room's proposals with
// decision states; privileged members decide inline.
Future<void> approvalsSheet(BuildContext context, String conversationId) async {
  final session = SessionScope.of(context, listen: false);
  await session.loadProposals(conversationId);
  if (!context.mounted) return;
  Map<String, dynamic>? room;
  for (final c in session.chats) {
    if (c is Map && '${c['id']}' == conversationId) {
      room = Map<String, dynamic>.from(c);
    }
  }
  final canDecide = session.canDecideIn(room);
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.9,
      builder: (sheet, controller) => ListenableBuilder(
        listenable: session,
        builder: (sheet, _) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(context.l10n.apprTitle, style: Theme.of(sheet).textTheme.titleLarge),
              const SizedBox(height: 8),
              Expanded(
                child: session.proposals.isEmpty
                    ? Center(child: Text(context.l10n.apprEmpty))
                    : ListView(
                        controller: controller,
                        children: [
                          for (final p in session.proposals)
                            if (p is Map)
                              Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.stretch,
                                    children: [
                                      Text('${p['author_name'] ?? ''} · ${p['state'] == 'approved' ? context.l10n.apprApprovedState : p['state'] == 'rejected' ? context.l10n.apprRejectedState : context.l10n.proposalPending}',
                                          style: Theme.of(sheet).textTheme.bodySmall),
                                      const SizedBox(height: 4),
                                      Text('${p['body'] ?? ''}'),
                                      if ('${p['state']}' == 'pending' && canDecide) ...[
                                        const SizedBox(height: 8),
                                        Row(
                                          children: [
                                            Expanded(
                                              child: FilledButton(
                                                onPressed: () => session.decideProposal(conversationId, '${p['message_id']}', 'approved'),
                                                child: Text(context.l10n.mvApprove),
                                              ),
                                            ),
                                            const SizedBox(width: 8),
                                            Expanded(
                                              child: OutlinedButton(
                                                onPressed: () => session.decideProposal(conversationId, '${p['message_id']}', 'rejected'),
                                                child: Text(context.l10n.apprReject),
                                              ),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

Future<void> _passwordDialog(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  final current = TextEditingController();
  final fresh = TextEditingController();
  final ready = ValueNotifier(false);
  void refresh() {
    ready.value = current.text.isNotEmpty && fresh.text.length >= 8;
  }

  current.addListener(refresh);
  fresh.addListener(refresh);
  // No synchronous dispose: the pop transition still touches these while
  // the session notify rebuilds. Unmount unregisters; GC collects.
  await showDialog<void>(
      context: context,
      builder: (dialog) => ValueListenableBuilder<bool>(
        valueListenable: ready,
        builder: (dialog, ok, _) => AlertDialog(
          title: Text(context.l10n.mvRecoverReset),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: current,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: context.l10n.mvPwCurrent, isDense: true),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: fresh,
                obscureText: true,
                decoration: InputDecoration(
                    labelText: context.l10n.roomNewPwHint, isDense: true),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(dialog).pop(),
                child: Text(context.l10n.mvCancel)),
            FilledButton(
              // Call first, pop second: the sync notify lands while the
              // dialog is active (controllers alive), matching _qrDialog.
              onPressed: ok
                  ? () {
                      session.changePassword(current.text, fresh.text);
                      Navigator.of(dialog).pop();
                    }
                  : null,
              child: Text(context.l10n.changeWord),
            ),
          ],
        ),
      ),
    );
}

class _StickerDeck extends StatefulWidget {
  const _StickerDeck();

  @override
  State<_StickerDeck> createState() => _StickerDeckState();
}

class _StickerDeckState extends State<_StickerDeck> {
  String _tab = '';

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final cats = session.stickerCategories;
    final active = cats.any((c) => '${c['id']}' == _tab)
        ? _tab
        : (cats.isEmpty ? '' : '${cats[0]['id']}');
    final items = [
      for (final c in cats)
        if ('${c['id']}' == active)
          ...((c['items'] as List?) ?? []).whereType<Map<String, dynamic>>(),
    ];
    return Container(
      height: cats.isEmpty ? 86 : 336,
      color: dark ? HarborDark.surface : Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: [
          SizedBox(
            height: 70,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: [
                for (final s in lunoOrbitCrewStickers)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ActionChip(
                      backgroundColor: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                      side: BorderSide.none,
                      label: Text("${s['emoji']} ${s['character']}"),
                      onPressed: () => session.send(
                          kind: 'sticker',
                          customBody: "${s['emoji']} [${s['character']}]",
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (cats.isNotEmpty) ...[
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                children: [
                  for (final c in cats)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: ChoiceChip(
                        label: Text(session.stickerCategoryTitle(c)),
                        selected: '${c['id']}' == active,
                        onSelected: (_) =>
                            setState(() => _tab = '${c['id']}'),
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(8),
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 4,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8),
                itemCount: items.length,
                itemBuilder: (context, i) {
                  final id = '${items[i]['id']}';
                  return GestureDetector(
                    onTap: () => session.send(kind: 'sticker', customBody: id,
                        metadata: {'sticker_id': id}),
                    child: StickerImage(
                      stickerId: id,
                      baseUrl: session.api.baseUrl,
                      size: 64,
                      fallbackGlyph: '${items[i]['label']}',
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String? _stickerIdOf(dynamic m) {
  final meta = m['metadata'];
  if (meta is! Map) return null;
  final id = meta['sticker_id'];
  return id is String ? id : null;
}

Future<void> _recordVoice(BuildContext context) {
  final session = SessionScope.of(context, listen: false);
  return withPermissions(
    context,
    permissions: [
      (Permission.microphone, context.l10n.permMicTitle, context.l10n.permMicUseVoiceMsg),
    ],
    action: () async {
      if (!context.mounted) return;
      final rec = await showDialog<VoiceRecording>(
        context: context,
        barrierDismissible: false,
        builder: (_) => VoiceRecordDialog(),
      );
      if (rec != null) session.sendVoice(rec.bytes, durationSec: rec.seconds);
    },
  );
}

Future<void> _sendImageWithEffect(BuildContext context, ImageSource source) async {
  final session = SessionScope.of(context, listen: false);
  // 시스템 사진 선택기(갤러리)는 권한이 필요 없으므로 카메라 경로만 가드한다.
  if (source == ImageSource.camera) {
    final ok = await withPermissions(
      context,
      permissions: [
        (Permission.camera, context.l10n.permCamTitle, context.l10n.permCamUsePhoto),
      ],
    );
    if (!ok || !context.mounted) return;
  }
  final pic = await session.pickChatImage(source);
  if (pic == null || !context.mounted) return;
  final effect = await showModalBottomSheet<String>(
    context: context,
    builder: (_) => PhotoEffectSheet(bytes: pic.bytes),
  );
  if (effect == null) return;
  await session.sendPickedImage(pic, effect: effect);
}

Future<void> _captureWithInAppCamera(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  final ok = await withPermissions(
    context,
    permissions: [
      (Permission.camera, context.l10n.permCamTitle, context.l10n.permCamUsePhotoVideo),
    ],
  );
  if (!ok || !context.mounted) return;
  final pic = await showDialog<PickedImage>(
    context: context,
    builder: (_) => const InAppCameraSheet(),
  );
  if (pic == null || !context.mounted) return;
  if (pic.mime.startsWith('video/')) {
    await session.sendPickedImage(pic);
    return;
  }
  final effect = await showModalBottomSheet<String>(
    context: context,
    builder: (_) => PhotoEffectSheet(bytes: pic.bytes),
  );
  if (effect == null) return;
  await session.sendPickedImage(pic, effect: effect);
}

void _pickImageSource(BuildContext context) {
  showModalBottomSheet(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: Text(context.l10n.roomPickGallery),
            onTap: () {
              Navigator.of(sheet).pop();
              _sendImageWithEffect(context, ImageSource.gallery);
            },
          ),
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: Text(context.l10n.roomTakePhoto),
            onTap: () {
              Navigator.of(sheet).pop();
              _captureWithInAppCamera(context);
            },
          ),
        ],
      ),
    ),
  );
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final Future<void> Function() onSend;
  const _Composer({required this.controller, required this.onSend});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final kind = DeviceScope.of(context);
    final dense = kind == DeviceKind.compactApp;
    final accent = dark ? HarborDark.harbor : HarborLight.harbor;
    final idle = dark ? HarborDark.drift : HarborLight.drift;
    // Two tools on the left, the text box takes the rest, one action on the
    // right: mic while empty, send once there is text (LINE-style).
    return Container(
      color: dark ? HarborDark.surface : Colors.white,
      padding: EdgeInsets.symmetric(horizontal: 4, vertical: dense ? 4 : 6),
      child: SafeArea(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            PopupMenuButton<String>(
              tooltip: context.l10n.mvMoreActions,
              icon: Icon(Icons.add, color: idle),
              onSelected: (v) {
                if (v == 'file') {
                  if (!session.busy) session.sendFile();
                } else if (v == 'location') {
                  _shareLocationDialog(context);
                } else if (v == 'contact') {
                  _shareContactSheet(context);
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(value: 'file', child: _MenuRow(Icons.attach_file, context.l10n.fileWord)),
                PopupMenuItem(value: 'location', child: _MenuRow(Icons.place_outlined, context.l10n.mvLocationShare)),
                PopupMenuItem(value: 'contact', child: _MenuRow(Icons.person_outline, context.l10n.mvShareContact)),
              ],
            ),
            IconButton(
              tooltip: context.l10n.camPhoto,
              icon: Icon(Icons.photo_outlined, color: idle),
              onPressed: () => _pickImageSource(context),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: TextField(
                  controller: controller,
                  style: const TextStyle(fontSize: LunoType.inputSize),
                  minLines: 1,
                  maxLines: dense ? 3 : 5,
                  textInputAction: TextInputAction.send,
                  decoration: InputDecoration(
                    hintText: context.l10n.roomComposerHint,
                    hintMaxLines: 1,
                    isDense: true,
                    filled: true,
                    fillColor: dark ? HarborDark.chart : const Color(0xFFF1F3F4),
                    contentPadding: const EdgeInsets.fromLTRB(14, 10, 4, 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.sheet),
                      borderSide: BorderSide.none,
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.sheet),
                      borderSide: BorderSide.none,
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.sheet),
                      borderSide: BorderSide(color: accent),
                    ),
                    suffixIcon: IconButton(
                      tooltip: context.l10n.mvSticker,
                      icon: Icon(Icons.sentiment_satisfied_alt_outlined, color: idle),
                      onPressed: () =>
                          SessionScope.of(context, listen: false).toggleStickerPicker(),
                    ),
                  ),
                  onSubmitted: (_) => onSend(),
                ),
              ),
            ),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: controller,
              builder: (context, value, _) => value.text.trim().isEmpty
                  ? IconButton(
                      tooltip: context.l10n.voiceMsgWord,
                      icon: Icon(Icons.mic_none, color: idle),
                      onPressed: () => _recordVoice(context),
                    )
                  : IconButton(
                      tooltip: context.l10n.sendBtn,
                      onPressed: session.busy ? null : onSend,
                      icon: Icon(Icons.send_rounded, color: accent),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
