// Route: /calls — call ledger. Rendered from GET /api/v1/calls, which
// merges live sessions with the call_status message ledger. Consecutive
// same-peer calls collapse into one LINE-style "name (n)" row; missed rows
// render red. Durations live in the detail view, not here.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/call_groups.dart';

class CallsPage extends StatelessWidget {
  const CallsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final groups = groupCalls(session.callHistory);
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '통화'),
              if (groups.isEmpty)
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
                for (var i = 0; i < groups.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _CallRow(group: groups[i]),
                ],
            ],
          ),
        ],
      ),
    );
  }
}

class _CallRow extends StatelessWidget {
  final CallGroup group;
  const _CallRow({required this.group});

  @override
  Widget build(BuildContext context) {
    final call = group.latest;
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final title = call['title']?.toString() ?? '알 수 없음';
    final outgoing = call['outgoing'] == true;
    final missed = group.missed;
    final kind = call['kind']?.toString() ?? 'voice';
    final label = group.count > 1 ? '$title (${group.count})' : title;

    final IconData directionIcon = missed
        ? (outgoing ? Icons.call_missed_outgoing : Icons.call_missed)
        : (outgoing ? Icons.call_made : Icons.call_received);
    final danger = dark ? HarborDark.danger : HarborLight.danger;
    final Color lineColor =
        missed ? danger : (dark ? HarborDark.drift : HarborLight.drift);

    return ListTile(
      onTap: () =>
          context.go("/calls/${call['conversation_id']?.toString() ?? ''}"),
      leading: IdentityTile(
        glyph: title,
        color: session.colorFromHex(
            call['peer_color']?.toString(),
            dark ? HarborDark.harbor : HarborLight.harbor),
      ),
      title: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 14,
          color: missed ? danger : null,
        ),
      ),
      subtitle: Row(
        children: [
          Icon(directionIcon, size: 14, color: lineColor),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              callRowDate(call['started_at']),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12, color: lineColor, fontFeatures: const [LunoType.tabular]),
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
