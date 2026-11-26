// F21: invite-link landing at /invite/:token. A link tap never auto-joins:
// the user confirms, the room opens on success, failures stay with the
// session notice.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class JoinPage extends StatefulWidget {
  final String token;
  const JoinPage({super.key, required this.token});

  @override
  State<JoinPage> createState() => _JoinPageState();
}

class _JoinPageState extends State<JoinPage> {
  bool _joining = false;

  Future<void> _join() async {
    if (_joining) return;
    setState(() => _joining = true);
    final session = SessionScope.of(context, listen: false);
    final roomId = await session.joinGroup(widget.token);
    if (!mounted) return;
    setState(() => _joining = false);
    if (roomId != null && roomId.isNotEmpty) context.go('/chats/$roomId');
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final line = dark ? HarborDark.channel : HarborLight.channel;
    final accent = dark ? HarborDark.harbor : HarborLight.harbor;
    final danger = dark ? HarborDark.danger : HarborLight.danger;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.joinTitle)),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: dark ? HarborDark.surface : HarborLight.surface,
                borderRadius: BorderRadius.circular(HarborRadius.card),
                border: Border.all(color: line),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 68,
                    height: 68,
                    decoration: BoxDecoration(
                      color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(Icons.group_add_outlined, size: 34, color: accent),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    context.l10n.joinDesc,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: dark ? HarborDark.chart : HarborLight.chart,
                      borderRadius: BorderRadius.circular(HarborRadius.lamp),
                    ),
                    child: Text(
                      widget.token,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: HarborType.small,
                        fontWeight: FontWeight.w700,
                        color: dark ? HarborDark.ink : HarborLight.ink,
                      ),
                    ),
                  ),
                  if (session.notice.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text(
                      session.notice,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: HarborType.small,
                        fontWeight: FontWeight.w600,
                        color: danger,
                      ),
                    ),
                  ],
                  const SizedBox(height: 22),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: session.busy ? null : _join,
                      child: _joining
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : Text(context.l10n.joinConfirm),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: _joining ? null : () => context.go('/chats'),
                      child: Text(context.l10n.mvCancel),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
