// Route: /calls — call ledger. Rendered from GET /api/v1/calls, which
// merges live sessions with the call_status message ledger.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class CallsPage extends StatelessWidget {
  const CallsPage({super.key});

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
              const Masthead(title: '통화', subtitle: '신호 기록부'),
              if (session.callHistory.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Column(
                    children: [
                      Icon(Icons.phone_disabled_outlined,
                          size: 48,
                          color: dark ? HarborDark.channel : HarborLight.channel),
                      const SizedBox(height: 12),
                      Text('통화 기록이 없습니다',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('대화방에서 음성 또는 영상 통화를 시작해 보세요',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                )
              else
                for (var i = 0; i < session.callHistory.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _CallRow(call: session.callHistory[i] as Map<String, dynamic>),
                ],
            ],
          ),
        ],
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  final Map<String, dynamic> call;
  const _CallRow({required this.call});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final title = call['title']?.toString() ?? '알 수 없음';
    final outgoing = call['outgoing'] == true;
    final result = call['result']?.toString() ?? '';
    final kind = call['kind']?.toString() ?? 'voice';
    final missed = result == 'missed' || result == 'declined';
    final duration = call['duration'] is num ? (call['duration'] as num).toInt() : 0;

    final IconData directionIcon = missed
        ? (outgoing ? Icons.call_missed_outgoing : Icons.call_missed)
        : (outgoing ? Icons.call_made : Icons.call_received);
    final Color lineColor = missed
        ? (dark ? HarborDark.danger : HarborLight.danger)
        : (dark ? HarborDark.drift : HarborLight.drift);

    final parts = <String>[session.relTime(call['started_at'])];
    if (missed) {
      parts.add(result == 'declined' ? '거절된 통화' : '부재중 전화');
    } else if (duration > 0) {
      parts.add('통화시간 ${session.formatDuration(duration)}');
    }

    return ListTile(
      leading: IdentityTile(
        glyph: title,
        color: session.colorFromHex(
            call['peer_color']?.toString(),
            dark ? HarborDark.harbor : HarborLight.harbor),
      ),
      title: Text(
        title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 14,
          color: missed ? (dark ? HarborDark.danger : HarborLight.danger) : null,
        ),
      ),
      subtitle: Row(
        children: [
          Icon(directionIcon, size: 14, color: lineColor),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              parts.join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: lineColor),
            ),
          ),
        ],
      ),
      trailing: IconButton(
        tooltip: kind == 'video' ? '영상통화' : '음성통화',
        icon: Icon(kind == 'video' ? Icons.videocam : Icons.phone,
            color: dark ? HarborDark.harbor : HarborLight.harbor),
        onPressed: () =>
            session.startCallIn(call['conversation_id']?.toString() ?? '', kind),
      ),
    );
  }
}
