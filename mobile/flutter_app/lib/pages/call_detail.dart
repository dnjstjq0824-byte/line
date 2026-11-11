// Route: /calls/:cid — per-peer call detail. Name + avatar, three working
// actions (open the chat, voice redial, video redial), and the peer's
// history grouped under day headers. Unknown peers get an honest empty.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/call_groups.dart';
import '../util/chat_time.dart';

class CallDetailPage extends StatelessWidget {
  final String conversationId;
  const CallDetailPage({super.key, required this.conversationId});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final entries = session.callHistory
        .whereType<Map<String, dynamic>>()
        .where((c) => '${c['conversation_id']}' == conversationId)
        .toList();
    final days = groupCallDays(entries);
    final name =
        entries.isEmpty ? '' : (entries.first['title']?.toString() ?? '');
    return ListView(
      children: [
        PageColumn(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: '뒤로',
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context.go('/calls'),
                ),
              ],
            ),
            if (entries.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 64),
                child: Column(
                  children: [
                    Icon(Icons.phone_disabled_outlined,
                        size: 48,
                        color:
                            dark ? HarborDark.channel : HarborLight.channel),
                    const SizedBox(height: 12),
                    Text('통화 기록이 없습니다',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.titleMedium),
                  ],
                ),
              )
            else ...[
              Row(
                children: [
                  Expanded(
                    child: Text(name.isEmpty ? '알 수 없음' : name,
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                            color: ink)),
                  ),
                  IdentityTile(
                    glyph: name,
                    color: session.colorFromHex(
                        entries.first['peer_color']?.toString(),
                        dark ? HarborDark.harbor : HarborLight.harbor),
                    size: 56,
                  ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _Action(
                    icon: Icons.chat_bubble,
                    label: '대화',
                    ink: ink,
                    onTap: () => context.go('/chats/$conversationId'),
                  ),
                  _Action(
                    icon: Icons.phone,
                    label: '음성통화',
                    ink: ink,
                    onTap: () =>
                        session.startCallIn(conversationId, 'voice'),
                  ),
                  _Action(
                    icon: Icons.videocam,
                    label: '영상통화',
                    ink: ink,
                    onTap: () =>
                        session.startCallIn(conversationId, 'video'),
                  ),
                ],
              ),
              const Divider(height: 32),
              for (final day in days) ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(day.label,
                      style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: ink)),
                ),
                const SizedBox(height: 8),
                for (final entry in day.items)
                  _HistoryRow(entry: entry, ink: ink, sub: sub, dark: dark),
                const SizedBox(height: 12),
              ],
            ],
          ],
        ),
      ],
    );
  }
}

class _Action extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color ink;
  final VoidCallback onTap;
  const _Action(
      {required this.icon,
      required this.label,
      required this.ink,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: Column(
          children: [
            Icon(icon, size: 28, color: ink),
            const SizedBox(height: 4),
            Text(label,
                style: TextStyle(fontSize: 13, color: ink)),
          ],
        ),
      ),
    );
  }
}

class _HistoryRow extends StatelessWidget {
  final Map<String, dynamic> entry;
  final Color ink;
  final Color sub;
  final bool dark;
  const _HistoryRow(
      {required this.entry,
      required this.ink,
      required this.sub,
      required this.dark});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final outgoing = entry['outgoing'] == true;
    final result = entry['result']?.toString() ?? '';
    final missed = isMissedCall(entry);
    final kind = entry['kind']?.toString() ?? 'voice';
    final duration =
        entry['duration'] is num ? (entry['duration'] as num).toInt() : 0;
    final right = (result == 'completed' || result.isEmpty) && duration > 0
        ? session.formatDuration(duration)
        : callOutcome(result);
    final IconData arrow = missed
        ? (outgoing ? Icons.call_missed_outgoing : Icons.call_missed)
        : (outgoing ? Icons.call_made : Icons.call_received);
    final danger = dark ? HarborDark.danger : HarborLight.danger;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(arrow, size: 16, color: missed ? danger : sub),
          const SizedBox(width: 8),
          Text(bubbleTime(entry['started_at']),
              style: TextStyle(fontSize: 14, color: ink)),
          const SizedBox(width: 8),
          Text(kind == 'video' ? '영상통화' : '음성통화',
              style: TextStyle(fontSize: 13, color: sub)),
          const Expanded(child: SizedBox()),
          Text(right,
              style: TextStyle(
                  fontSize: 14,
                  color: ink,
                  fontFeatures: const [LunoType.tabular])),
        ],
      ),
    );
  }
}
