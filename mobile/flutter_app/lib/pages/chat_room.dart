// Route: /chats/:cid — the vessel deck. Messages only; pins, notes,
// events and polls each have their own sub-route below this one.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../legacy_tokens.dart';
import '../state/session.dart';

class ChatRoomPage extends StatefulWidget {
  final String conversationId;
  const ChatRoomPage({super.key, required this.conversationId});

  @override
  State<ChatRoomPage> createState() => _ChatRoomPageState();
}

class _ChatRoomPageState extends State<ChatRoomPage> {
  final message = TextEditingController();
  bool _opened = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = SessionScope.of(context, listen: false);
      if (session.selectedId != widget.conversationId) {
        session.openChat(widget.conversationId);
      }
      if (mounted) setState(() => _opened = true);
    });
  }

  @override
  void dispose() {
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
                    child: Text('공지: ${session.pins.first['body'] ?? ''}',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: dark ? HarborDark.ink : HarborLight.harbor)),
                  ),
                ],
              ),
            ),
          ),
        Expanded(
          child: Container(
            color: dark ? HarborDark.fog : const Color(0xFFDDE7E3),
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: session.messages.length,
                    itemBuilder: (_, i) => _SignalBubble(entry: session.messages[i]),
                  ),
          ),
        ),
        if (session.showStickerPicker) const _StickerDeck(),
        if (session.replyToId.isNotEmpty)
          Container(
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('답장 작성 중...',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: dark ? HarborDark.ink : HarborLight.harbor)),
                IconButton(
                  icon: const Icon(Icons.close, size: 16),
                  onPressed: () =>
                      SessionScope.of(context, listen: false).setReply(''),
                ),
              ],
            ),
          ),
        _Composer(
          controller: message,
          onSend: () {
            final text = message.text;
            message.clear();
            session.send(text: text);
          },
        ),
      ],
    );
  }
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
                tooltip: '대화 목록',
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
                            fontWeight: FontWeight.w700,
                            fontSize: 15),
                      ),
                    ),
                    if (session.letterSealing)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: Icon(Icons.lock,
                            size: 14,
                            color: dark ? HarborDark.harbor : HarborLight.seaGlass),
                      ),
                  ],
                ),
              ),
              IconButton(
                tooltip: '음성통화',
                icon: Icon(Icons.phone, color: dark ? HarborDark.ink : Colors.white),
                onPressed: () => session.startCall('voice'),
              ),
              IconButton(
                tooltip: '영상통화',
                icon: Icon(Icons.videocam, color: dark ? HarborDark.ink : Colors.white),
                onPressed: () => session.startCall('video'),
              ),
              PopupMenuButton<String>(
                tooltip: '보관함',
                icon: Icon(Icons.inventory_2_outlined,
                    color: dark ? HarborDark.ink : Colors.white),
                onSelected: (value) => context.go('/chats/$conversationId/$value'),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'pins', child: Text('공지')),
                  PopupMenuItem(value: 'notes', child: Text('노트')),
                  PopupMenuItem(value: 'events', child: Text('일정')),
                  PopupMenuItem(value: 'polls', child: Text('투표')),
                ],
              ),
              IconButton(
                tooltip: '송금',
                icon: Icon(Icons.payments_outlined,
                    color: dark ? HarborDark.ink : Colors.white),
                onPressed: session.sendPayInChat,
              ),
              IconButton(
                tooltip: '오프라인 동기화',
                icon: Icon(Icons.sync, color: dark ? HarborDark.ink : Colors.white),
                onPressed: session.syncOffline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignalBubble extends StatelessWidget {
  final dynamic entry;
  const _SignalBubble({required this.entry});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final m = entry;
    final mine = m['sender_id'] == session.selfId;
    final readCount = (m['read_count'] as num?)?.toInt() ?? 0;
    final msgId = '${m['id'] ?? ''}';
    final trans = session.translations[msgId];
    final bubble = mine
        ? (dark ? HarborDark.mine : HarborLight.mine)
        : (dark ? HarborDark.theirs : HarborLight.theirs);
    final ink = mine ? Colors.white : (dark ? HarborDark.ink : HarborLight.ink);
    final faint = mine
        ? Colors.white.withValues(alpha: 0.75)
        : (dark ? HarborDark.drift : HarborLight.drift);
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        constraints: const BoxConstraints(maxWidth: 340),
        decoration: BoxDecoration(
          color: bubble,
          borderRadius: mine ? HarborRadius.mine : HarborRadius.theirs,
        ),
        child: InkWell(
          onLongPress: () =>
              SessionScope.of(context, listen: false).setReply(msgId),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Column(
              crossAxisAlignment:
                  mine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (m['reply_to'] != null && '${m['reply_to']}'.isNotEmpty)
                  Text('↩ ${m['reply_preview'] ?? '답장'}',
                      style: TextStyle(fontSize: 10, color: faint)),
                Text('${m['body']}',
                    style: TextStyle(
                        color: ink,
                        fontSize: m['kind'] == 'sticker' ? 24 : 14,
                        height: 1.35)),
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
                        ? const Text('AI 번역 중...',
                            style: TextStyle(fontSize: 11, fontStyle: FontStyle.italic))
                        : trans['error'] != null
                            ? Text('${trans['error']}',
                                style: TextStyle(fontSize: 11, color: faint))
                            : Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text('[LUNO AI] ',
                                          style: TextStyle(
                                              fontSize: 10,
                                              fontWeight: FontWeight.w800,
                                              color: mine
                                                  ? Colors.white
                                                  : (dark
                                                      ? HarborDark.harbor
                                                      : HarborLight.harbor))),
                                      Text('${trans['target_lang']}'
                                          .toString()
                                          .toUpperCase()),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text('${trans['translated']}',
                                      style: TextStyle(
                                          fontSize: 12,
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
                    if (readCount > 0)
                      Text('읽음 $readCount',
                          style: TextStyle(
                              fontSize: 10, fontWeight: FontWeight.w700, color: faint)),
                    if (m['edited_at'] != null && '${m['edited_at']}'.isNotEmpty)
                      Text('(수정됨)', style: TextStyle(fontSize: 9, color: faint)),
                    for (final emo in lunoReactions.take(3))
                      InkWell(
                        onTap: () => session.react(m['id'], emo),
                        child: Text(emo, style: const TextStyle(fontSize: 12)),
                      ),
                    InkWell(
                      onTap: () => session.translateMessage(msgId, '${m['body']}'),
                      child: Icon(Icons.translate, size: 14, color: faint),
                    ),
                    InkWell(
                      onTap: () => session.pin(m['id']),
                      child: Icon(Icons.push_pin, size: 13, color: faint),
                    ),
                    InkWell(
                      onTap: () => session.saveToKeep(m['id'], '${m['body']}'),
                      child: Icon(Icons.bookmark_border, size: 13, color: faint),
                    ),
                    if (mine)
                      InkWell(
                        onTap: () => session.unsend(m['id']),
                        child: Icon(Icons.delete_outline, size: 13, color: faint),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StickerDeck extends StatelessWidget {
  const _StickerDeck();

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 86,
      color: dark ? HarborDark.surface : Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 8),
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
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onSend;
  const _Composer({required this.controller, required this.onSend});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final kind = DeviceScope.of(context);
    final dense = kind == DeviceKind.compactApp;
    return Container(
      color: dark ? HarborDark.surface : Colors.white,
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: dense ? 4 : 8),
      child: SafeArea(
        child: Row(
          children: [
            IconButton(
              tooltip: '스티커',
              icon: Icon(Icons.stars_rounded,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
              onPressed: () =>
                  SessionScope.of(context, listen: false).toggleStickerPicker(),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: dense ? 2 : 4,
                decoration: const InputDecoration(
                  hintText: '메시지를 입력하세요 (LUNO AI 실시간 연결)',
                  isDense: true,
                ),
                onSubmitted: (_) => onSend(),
              ),
            ),
            IconButton(
              tooltip: '전송',
              onPressed: session.busy ? null : onSend,
              icon: Icon(Icons.send_rounded,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
            ),
          ],
        ),
      ),
    );
  }
}
