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
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.joinTitle)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.group_add_outlined, size: 56),
              const SizedBox(height: 16),
              Text(context.l10n.joinDesc, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(widget.token,
                  style: TextStyle(
                      fontSize: HarborType.small,
                      color: dark ? HarborDark.drift : HarborLight.drift)),
              if (session.notice.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(session.notice,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: session.busy ? null : _join,
                child: _joining
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : Text(context.l10n.joinConfirm),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
