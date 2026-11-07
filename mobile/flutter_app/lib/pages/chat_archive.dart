// Routes: /chats/:cid/pins|notes|events|polls — previously loaded but
// never shown; each archive now has its own address.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

enum ChatArchiveKind { pins, notes, events, polls }

class ChatArchivePage extends StatefulWidget {
  final String conversationId;
  final ChatArchiveKind kind;
  const ChatArchivePage({super.key, required this.conversationId, required this.kind});

  @override
  State<ChatArchivePage> createState() => _ChatArchivePageState();
}

class _ChatArchivePageState extends State<ChatArchivePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = SessionScope.of(context, listen: false);
      if (session.selectedId != widget.conversationId) {
        session.openChat(widget.conversationId);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (title, subtitle, items) = switch (widget.kind) {
      ChatArchiveKind.pins => ('공지', '고정된 항로 지시', session.pins),
      ChatArchiveKind.notes => ('노트', '대화방에 남긴 기록', session.notes),
      ChatArchiveKind.events => ('일정', '예정된 집합 신호', session.events),
      ChatArchiveKind.polls => ('투표', '진행 중인 표결', session.polls),
    };
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: title, subtitle: '${session.titleOf(widget.conversationId)} · $subtitle'),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 64),
                child: Text('등록된 $title이(가) 없습니다',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium),
              ),
            for (final item in items)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  color: dark ? HarborDark.surface : Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HarborRadius.card),
                    side: BorderSide(
                        color: dark ? HarborDark.channel : HarborLight.channel),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      '${item['body'] ?? item['title'] ?? item['question'] ?? ''}',
                      style: const TextStyle(height: 1.45),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
