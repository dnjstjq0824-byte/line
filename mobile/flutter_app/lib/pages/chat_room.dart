// Route: /chats/:cid — the vessel deck. Messages only; pins, notes,
// events and polls each have their own sub-route below this one.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../legacy_tokens.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/attachments.dart';
import '../util/voice_recorder.dart';
import '../util/stickers.dart';
import '../util/photo_effects.dart';
import '../util/inapp_camera.dart';
import '../util/video_bubble.dart';
import '../util/chat_time.dart';

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
        if (session.autoTranslate)
          Container(
            width: double.infinity,
            color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            child: Text('자동 번역 켜짐 · ${session.targetTranslateLang.toUpperCase()} (상대 메시지 자동 번역)',
                style: TextStyle(
                    fontSize: 11,
                    color: dark ? HarborDark.ink : HarborLight.harbor)),
          ),
        Expanded(
          child: Container(
            color: LunoTheme.chatRoomBackgroundColor(
                dark ? Brightness.dark : Brightness.light),
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : ListView.builder(
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
                              peerName: session.selectedTitle.isEmpty
                                  ? session.titleOf(widget.conversationId)
                                  : session.selectedTitle,
                            ),
                          ),
                        ],
                      );
                    },
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
                            fontWeight: LunoType.titleWeight,
                            fontSize: LunoType.titleSize,
                            height: LunoType.titleHeight),
                      ),
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
                  PopupMenuItem(value: 'albums', child: Text('앨범')),
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
                errorBuilder: (_, __, ___) => const Padding(
                    padding: EdgeInsets.all(24), child: Text('이미지를 불러올 수 없습니다'))),
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
                  Text(label, style: const TextStyle(fontSize: 12))),
        ),
      ),
    );
  }
}

class _DateDivider extends StatelessWidget {
  final dynamic iso;
  const _DateDivider({required this.iso});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final label = dividerLabel(iso);
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
                  fontSize: 11,
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
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final m = entry;
    final mine = m['sender_id'] == session.selfId;
    final readCount = (m['read_count'] as num?)?.toInt() ?? 0;
    final msgId = '${m['id'] ?? ''}';
    final trans = session.translations[msgId];
    final bubble = mine
        ? (dark ? LunoDark.bubbleMineBg : LunoLight.bubbleMineBg)
        : (dark ? LunoDark.bubbleTheirsBg : LunoLight.bubbleTheirsBg);
    final ink = mine
        ? (dark ? LunoDark.bubbleMineText : LunoLight.bubbleMineText)
        : (dark ? LunoDark.bubbleTheirsText : LunoLight.bubbleTheirsText);
    final faint = mine
        ? Colors.white.withValues(alpha: 0.75)
        : (dark ? HarborDark.drift : HarborLight.drift);
    final time = groupTail ? bubbleTime(m['created_at']) : '';
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
                    label: Text('저장',
                        style: TextStyle(color: ink, fontSize: 12)),
                  ),
                if (m['kind'] == 'sticker')
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
                    if (groupTail && readCount > 0)
                      Text('읽음 $readCount',
                          style: TextStyle(
                              fontSize: LunoType.stampSize,
                              fontWeight: LunoType.stampWeight,
                              fontFeatures: const [LunoType.tabular],
                              color: faint)),
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

String? _stickerIdOf(dynamic m) {
  final meta = m['metadata'];
  if (meta is! Map) return null;
  final id = meta['sticker_id'];
  return id is String ? id : null;
}

void _recordVoice(BuildContext context) {
  final session = SessionScope.of(context, listen: false);
  showDialog<VoiceRecording>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const VoiceRecordDialog(),
  ).then((rec) {
    if (rec != null) session.sendVoice(rec.bytes, durationSec: rec.seconds);
  });
}

Future<void> _sendImageWithEffect(BuildContext context, ImageSource source) async {
  final session = SessionScope.of(context, listen: false);
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
            title: const Text('갤러리에서 선택'),
            onTap: () {
              Navigator.of(sheet).pop();
              _sendImageWithEffect(context, ImageSource.gallery);
            },
          ),
          ListTile(
            leading: const Icon(Icons.camera_alt_outlined),
            title: const Text('카메라로 촬영'),
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
              tooltip: '사진',
              icon: Icon(Icons.photo_outlined,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
              onPressed: () => _pickImageSource(context),
            ),
            IconButton(
              tooltip: '스티커',
              icon: Icon(Icons.stars_rounded,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
              onPressed: () =>
                  SessionScope.of(context, listen: false).toggleStickerPicker(),
            ),
            IconButton(
              tooltip: '음성 메시지',
              icon: Icon(Icons.mic_outlined,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
              onPressed: () => _recordVoice(context),
            ),
            IconButton(
              tooltip: '파일',
              icon: Icon(Icons.attach_file,
                  color: dark ? HarborDark.harbor : HarborLight.harbor),
              onPressed: session.busy ? null : () => session.sendFile(),
            ),
            Expanded(
              child: TextField(
                controller: controller,
                style: const TextStyle(fontSize: LunoType.inputSize),
                minLines: 1,
                maxLines: dense ? 2 : 4,
                decoration: const InputDecoration(
                  hintText: '메시지를 입력하세요',
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
