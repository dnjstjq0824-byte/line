// PC agent bar: shown above the composer in rooms that have a bot. One line
// of runner presence (ready / working / offline) and one-tap command chips,
// so a command needs no typing on the road. Chips send a real message
// through the normal send path — the server routes it to the home PC.
import 'dart:async';

import 'package:flutter/material.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

/// Quick commands, in display order. The label is localized; the command is
/// what the runner parses (tools/pc-agent/src/commands.mjs).
enum PcQuickAction { status, git, check, proceed }

String pcQuickCommand(PcQuickAction action) => switch (action) {
      PcQuickAction.status => '/status',
      PcQuickAction.git => '/git',
      PcQuickAction.check => '/check',
      PcQuickAction.proceed => '/continue',
    };

String pcQuickLabel(AppLocalizations l10n, PcQuickAction action) =>
    switch (action) {
      PcQuickAction.status => l10n.pcQuickStatus,
      PcQuickAction.git => l10n.pcQuickGit,
      PcQuickAction.check => l10n.pcQuickCheck,
      PcQuickAction.proceed => l10n.pcQuickContinue,
    };

/// 'ready' | 'busy' | 'offline' for the row; any unknown value is offline.
String pcAgentState(Map<String, dynamic> bot) {
  final state = '${bot['state'] ?? ''}';
  return state == 'ready' || state == 'busy' ? state : 'offline';
}

/// HH:mm in local time from an ISO timestamp, or '' when unreadable.
String pcAgentClock(Object? iso) {
  final at = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  if (at == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(at.hour)}:${two(at.minute)}';
}

class PcAgentBar extends StatefulWidget {
  final String conversationId;
  const PcAgentBar({super.key, required this.conversationId});

  @override
  State<PcAgentBar> createState() => _PcAgentBarState();
}

class _PcAgentBarState extends State<PcAgentBar> {
  // Presence also arrives by push; the poll covers the offline edge (a runner
  // that stops calling sends nothing) and missed pushes.
  static const _pollEvery = Duration(seconds: 20);
  Timer? _poll;
  String _sending = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refresh());
    _poll = Timer.periodic(_pollEvery, (_) => _refresh());
  }

  @override
  void didUpdateWidget(PcAgentBar old) {
    super.didUpdateWidget(old);
    if (old.conversationId != widget.conversationId) _refresh();
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    final session = SessionScope.of(context, listen: false);
    if (!session.isForeground) return;
    unawaited(session.loadRoomBots(widget.conversationId));
  }

  Future<void> _send(PcQuickAction action) async {
    if (_sending.isNotEmpty) return;
    final command = pcQuickCommand(action);
    setState(() => _sending = command);
    try {
      await SessionScope.of(context, listen: false).send(text: command);
    } finally {
      if (mounted) setState(() => _sending = '');
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    if (session.roomBotsFor != widget.conversationId ||
        session.roomBots.isEmpty) {
      return const SizedBox.shrink();
    }
    final dark = Theme.of(context).brightness == Brightness.dark;
    final l10n = context.l10n;
    final ink = dark ? HarborDark.ink : HarborLight.ink;
    final drift = dark ? HarborDark.drift : HarborLight.drift;
    return Container(
      key: const ValueKey('pc-agent-bar'),
      decoration: BoxDecoration(
        color: dark ? HarborDark.surface : HarborLight.surface,
        border: Border(
            top: BorderSide(
                color: dark ? HarborDark.channel : HarborLight.channel)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final bot in session.roomBots)
            _PresenceRow(bot: bot, ink: ink, drift: drift, dark: dark),
          if (session.roomBotCommands) ...[
            const SizedBox(height: 6),
            SizedBox(
              height: 44,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: PcQuickAction.values.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final action = PcQuickAction.values[i];
                  final busy = _sending == pcQuickCommand(action);
                  return Center(
                    child: ActionChip(
                      key: ValueKey('pc-quick-${action.name}'),
                      label: Text(pcQuickLabel(l10n, action)),
                      avatar: busy
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : null,
                      labelStyle: TextStyle(
                          fontSize: HarborType.small,
                          fontWeight: FontWeight.w600,
                          color: dark ? HarborDark.harbor : HarborLight.harbor),
                      backgroundColor:
                          dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(HarborRadius.lamp)),
                      materialTapTargetSize: MaterialTapTargetSize.padded,
                      onPressed: _sending.isEmpty ? () => _send(action) : null,
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

class _PresenceRow extends StatelessWidget {
  final Map<String, dynamic> bot;
  final Color ink;
  final Color drift;
  final bool dark;
  const _PresenceRow(
      {required this.bot,
      required this.ink,
      required this.drift,
      required this.dark});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = pcAgentState(bot);
    final dot = switch (state) {
      'ready' => dark ? HarborDark.success : HarborLight.success,
      'busy' => dark ? HarborDark.beacon : HarborLight.beacon,
      _ => drift,
    };
    final label = switch (state) {
      'ready' => l10n.pcAgentReady,
      'busy' => l10n.pcAgentBusy,
      _ => l10n.pcAgentOffline,
    };
    final details = <String>[
      if (state == 'busy' && '${bot['detail'] ?? ''}'.isNotEmpty)
        '${bot['detail']}',
      if (state != 'offline' && ((bot['queue'] as num?) ?? 0) > 0)
        l10n.pcAgentQueue(((bot['queue'] as num?) ?? 0).toInt()),
      if (state == 'offline' && pcAgentClock(bot['last_seen_at']).isNotEmpty)
        l10n.pcAgentLastSeen(pcAgentClock(bot['last_seen_at'])),
    ];
    final name = '${bot['display_name'] ?? ''}';
    return Semantics(
      label: '$name $label ${details.join(' ')}',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Container(
              key: ValueKey('pc-agent-dot-$state'),
              width: 9,
              height: 9,
              decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(
                      text: name,
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: ink)),
                  TextSpan(
                      text: '  $label',
                      style: TextStyle(
                          fontWeight: FontWeight.w600, color: ink)),
                  if (details.isNotEmpty)
                    TextSpan(
                        text: '  ·  ${details.join('  ·  ')}',
                        style: TextStyle(color: drift)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: HarborType.small),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
