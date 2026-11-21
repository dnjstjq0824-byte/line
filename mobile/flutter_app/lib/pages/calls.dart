// Route: /calls — call ledger. Rendered from GET /api/v1/calls, which
// merges live sessions with the call_status message ledger. Consecutive
// same-peer calls collapse into one LINE-style "name (n)" row; missed rows
// render red. Durations live in the detail view, not here.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../widgets/no_pull_refresh.dart';
import '../widgets/harbor_empty.dart';
import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/app_permissions.dart';
import '../util/call_groups.dart';
import '../util/app_l10n.dart';

class CallsPage extends StatelessWidget {
  const CallsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final groups = groupCalls(session.callHistory);
    return NoPullRefresh(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.mvCall),
              if (groups.isEmpty)
                HarborEmpty(
                  title: context.l10n.callsEmpty,
                  hint: context.l10n.callsStartHint,
                  icon: Icons.phone_disabled_outlined,
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
    final title = call['title']?.toString() ?? context.l10n.unknownWord;
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
              callRowDate(call['started_at'], locale: session.locale),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: HarborType.small, color: lineColor, fontFeatures: const [LunoType.tabular]),
            ),
          ),
        ],
      ),
      trailing: IconButton(
        tooltip: kind == 'video' ? context.l10n.callVideo : context.l10n.callVoice,
        icon: Icon(kind == 'video' ? Icons.videocam : Icons.phone,
            color: dark ? HarborDark.harbor : HarborLight.harbor),
        onPressed: () => withPermissions(
          context,
          permissions: [
            (Permission.microphone, context.l10n.permMicTitle, context.l10n.permMicUseCall),
            if (kind == 'video')
              (Permission.camera, context.l10n.permCamTitle, context.l10n.permCamUseVideo),
          ],
          action: () async => session.startCallIn(
              call['conversation_id']?.toString() ?? '', kind),
        ),
      ),
    );
  }
}
