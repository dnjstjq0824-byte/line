// Routes: /chats/:cid/pins|notes|events|polls|albums — each archive has
// its own address, with create dialogs plus vote/RSVP actions where the
// server supports them.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/poll_options.dart';

enum ChatArchiveKind { pins, notes, events, polls, albums }

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

  void _openCreate(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    switch (widget.kind) {
      case ChatArchiveKind.notes:
        showDialog(
          context: context,
          builder: (_) => _NoteDialog(onSave: session.createNote),
        );
      case ChatArchiveKind.events:
        showDialog(
          context: context,
          builder: (_) => _EventDialog(
              onSave: (t, s, l) =>
                  session.createEvent(title: t, startsAt: s, location: l)),
        );
      case ChatArchiveKind.polls:
        showDialog(
          context: context,
          builder: (_) => _PollDialog(onSave: session.createPoll),
        );
      case ChatArchiveKind.albums:
        showDialog(
          context: context,
          builder: (_) => _AlbumDialog(
              onSave: (t, inc) =>
                  session.createAlbum(t, includePhotos: inc)),
        );
      case ChatArchiveKind.pins:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final (title, subtitle, items, createLabel) = switch (widget.kind) {
      ChatArchiveKind.pins => ('공지', '고정된 항로 지시', session.pins, ''),
      ChatArchiveKind.notes => ('노트', '대화방에 남긴 기록', session.notes, '새 노트'),
      ChatArchiveKind.events => ('일정', '예정된 집합 신호', session.events, '새 일정'),
      ChatArchiveKind.polls => ('투표', '진행 중인 표결', session.polls, '새 투표'),
      ChatArchiveKind.albums => ('앨범', '대화방 사진 묶음', session.albums, '새 앨범'),
    };
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: title, subtitle: '${session.titleOf(widget.conversationId)} · $subtitle'),
            if (createLabel.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  children: [
                    const Spacer(),
                    FilledButton.tonalIcon(
                      onPressed: session.busy ? null : () => _openCreate(context),
                      icon: const Icon(Icons.add, size: 18),
                      label: Text(createLabel),
                    ),
                  ],
                ),
              ),
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
                child: _ArchiveCard(kind: widget.kind, item: item),
              ),
          ],
        ),
      ],
    );
  }
}

class _ArchiveCard extends StatelessWidget {
  final ChatArchiveKind kind;
  final dynamic item;
  const _ArchiveCard({required this.kind, required this.item});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Card(
      color: dark ? HarborDark.surface : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        side: BorderSide(
            color: dark ? HarborDark.channel : HarborLight.channel),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: switch (kind) {
          ChatArchiveKind.polls => _PollBody(item: item),
          ChatArchiveKind.events => _EventBody(item: item),
          ChatArchiveKind.albums => _AlbumBody(item: item),
          _ => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if ('${item['title'] ?? ''}'.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text('${item['title']}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                  ),
                Text(
                  '${item['body'] ?? ''}',
                  style: const TextStyle(height: 1.45),
                ),
              ],
            ),
        },
      ),
    );
  }
}

class _PollBody extends StatelessWidget {
  final dynamic item;
  const _PollBody({required this.item});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final options = item is Map && item['options'] is List
        ? (item['options'] as List)
        : const [];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${item['question'] ?? ''}',
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 4),
        Text(
            item['closed'] == true
                ? '종료됨 · ${item['total_voters'] ?? 0}명 참여'
                : '진행 중 · ${item['total_voters'] ?? 0}명 참여',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        for (final o in options)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: OutlinedButton(
              onPressed: item['closed'] == true || session.busy
                  ? null
                  : () => session.votePoll('${item['id']}', '${o['id']}'),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                    '${o['voted'] == true ? '✓ ' : ''}${o['text'] ?? ''} (${o['votes'] ?? 0})'),
              ),
            ),
          ),
      ],
    );
  }
}

class _EventBody extends StatelessWidget {
  final dynamic item;
  const _EventBody({required this.item});

  static const _rsvpLabels = {
    'going': '참석',
    'maybe': '미정',
    'no': '불참',
  };

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final my = '${item['my_rsvp'] ?? ''}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${item['title'] ?? ''}',
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 4),
        Text(
            '${item['starts_at'] ?? ''}${'${item['location'] ?? ''}'.isNotEmpty ? ' · ${item['location']}' : ''}',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(my.isEmpty ? '아직 응답하지 않았습니다' : '내 응답: ${_rsvpLabels[my] ?? my}',
            style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final e in _rsvpLabels.entries)
              ChoiceChip(
                label: Text(e.value),
                selected: my == e.key,
                onSelected: session.busy
                    ? null
                    : (_) => session.rsvpEvent('${item['id']}', e.key),
              ),
          ],
        ),
      ],
    );
  }
}

class _AlbumBody extends StatelessWidget {
  final dynamic item;
  const _AlbumBody({required this.item});

  @override
  Widget build(BuildContext context) {
    final count =
        item is Map && item['attachment_ids'] is List
            ? (item['attachment_ids'] as List).length
            : 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${item['title'] ?? ''}',
            style:
                const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 4),
        Text('사진 $count장 · ${item['created_at'] ?? ''}',
            style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _NoteDialog extends StatefulWidget {
  final Future<void> Function({required String body, String title}) onSave;
  const _NoteDialog({required this.onSave});

  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  final title = TextEditingController();
  final body = TextEditingController();

  @override
  void dispose() {
    title.dispose();
    body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('새 노트'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: title,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '제목 (필수)', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: body,
              maxLines: 4,
              decoration: const InputDecoration(
                  labelText: '내용', isDense: true)),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: title.text.trim().isEmpty
              ? null
              : () {
                  Navigator.of(context).pop();
                  widget.onSave(title: title.text, body: body.text);
                },
          child: const Text('저장'),
        ),
      ],
    );
  }
}

class _EventDialog extends StatefulWidget {
  final Future<void> Function(String title, String startsAt, String location)
      onSave;
  const _EventDialog({required this.onSave});

  @override
  State<_EventDialog> createState() => _EventDialogState();
}

class _EventDialogState extends State<_EventDialog> {
  final title = TextEditingController();
  final location = TextEditingController();
  DateTime? startsAt;

  @override
  void dispose() {
    title.dispose();
    location.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365 * 2)),
      initialDate: startsAt ?? now,
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime:
          TimeOfDay.fromDateTime(startsAt ?? now),
    );
    if (time == null || !mounted) return;
    setState(() {
      startsAt = DateTime(
          date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('새 일정'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: title,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '제목 (필수)', isDense: true)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Text(
                    startsAt == null
                        ? '시작 시각을 고르세요 (필수)'
                        : '${startsAt!.year}-${startsAt!.month.toString().padLeft(2, '0')}-${startsAt!.day.toString().padLeft(2, '0')} ${startsAt!.hour.toString().padLeft(2, '0')}:${startsAt!.minute.toString().padLeft(2, '0')}',
                    style: Theme.of(context).textTheme.bodySmall),
              ),
              TextButton(
                  onPressed: _pick, child: const Text('날짜·시간')),
            ],
          ),
          TextField(
              controller: location,
              decoration: const InputDecoration(
                  labelText: '장소 (선택)', isDense: true)),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: title.text.trim().isEmpty || startsAt == null
              ? null
              : () {
                  Navigator.of(context).pop();
                  widget.onSave(title.text, startsAt!.toIso8601String(),
                      location.text);
                },
          child: const Text('등록'),
        ),
      ],
    );
  }
}

class _PollDialog extends StatefulWidget {
  final Future<void> Function(String question, String optionsText) onSave;
  const _PollDialog({required this.onSave});

  @override
  State<_PollDialog> createState() => _PollDialogState();
}

class _PollDialogState extends State<_PollDialog> {
  final question = TextEditingController();
  final options = TextEditingController();

  @override
  void dispose() {
    question.dispose();
    options.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final parsed = pollOptionsOf(options.text);
    final valid = pollFormValid(question.text, parsed);
    return AlertDialog(
      title: const Text('새 투표'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: question,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '질문 (필수)', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: options,
              onChanged: (_) => setState(() {}),
              maxLines: 5,
              decoration: const InputDecoration(
                  labelText: '선택지 (줄마다 하나씩, 2~10개)',
                  isDense: true)),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: valid
              ? () {
                  Navigator.of(context).pop();
                  widget.onSave(question.text, options.text);
                }
              : null,
          child: const Text('만들기'),
        ),
      ],
    );
  }
}

class _AlbumDialog extends StatefulWidget {
  final Future<void> Function(String title, bool includePhotos) onSave;
  const _AlbumDialog({required this.onSave});

  @override
  State<_AlbumDialog> createState() => _AlbumDialogState();
}

class _AlbumDialogState extends State<_AlbumDialog> {
  final title = TextEditingController();
  bool includePhotos = true;

  @override
  void dispose() {
    title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('새 앨범'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: title,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '앨범 제목 (필수)', isDense: true)),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const Text('대화방 사진 한 번에 담기',
                style: TextStyle(fontSize: 13)),
            value: includePhotos,
            onChanged: (v) => setState(() => includePhotos = v ?? true),
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: title.text.trim().isEmpty
              ? null
              : () {
                  Navigator.of(context).pop();
                  widget.onSave(title.text, includePhotos);
                },
          child: const Text('만들기'),
        ),
      ],
    );
  }
}
