// Route: /chats/:cid/safety — E9: safety numbers for a 1:1 sealed room.
// Compare with the peer out-of-band, then verify each device.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../e2ee/store.dart' show SafetyNumber;
import '../state/session.dart';
import '../util/app_l10n.dart';

class SafetyNumberPage extends StatefulWidget {
  final String conversationId;
  const SafetyNumberPage({super.key, required this.conversationId});

  @override
  State<SafetyNumberPage> createState() => _SafetyNumberPageState();
}

class _SafetyNumberPageState extends State<SafetyNumberPage> {
  bool _loading = true;
  String _peer = '';
  List<SafetyNumber> _rows = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    final s = SessionScope.of(context, listen: false);
    var peer = '';
    for (final c in s.chats) {
      if (c is Map && '${c['id']}' == widget.conversationId) {
        for (final m in ((c['members'] ?? []) as List)) {
          final id = m is Map ? '${m['id']}' : '';
          if (id.isNotEmpty && id != s.selfId) peer = id;
        }
      }
    }
    final rows = peer.isEmpty ? <SafetyNumber>[] : await s.safetyNumbersFor(peer);
    if (!mounted) return;
    setState(() {
      _peer = peer;
      _rows = rows;
      _loading = false;
    });
  }

  Future<void> _verify(SafetyNumber row) async {
    await SessionScope.of(context, listen: false)
        .verifySafetyDevice(_peer, row.device, row.edPub);
    if (!mounted) return;
    setState(() => _loading = true);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final l = context.l10n;
    final mine = session.mySafetyIdentity() ?? '';
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: l.backWord,
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Text(l.e2eeSfTitle),
      ),
      body: PageColumn(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(l.e2eeSfHow, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 12),
                if (_loading)
                  const Center(child: CircularProgressIndicator())
                else if (_rows.isEmpty)
                  Text(l.e2eeSfNone)
                else
                  for (final row in _rows)
                    Card(
                      color: dark ? HarborDark.surface : Colors.white,
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.spaceBetween,
                              children: [
                                Expanded(
                                  child: Text(row.device,
                                      style: const TextStyle(
                                          fontFamily: 'monospace')),
                                ),
                                row.verified
                                    ? Text(l.e2eeSfVerified,
                                        style: TextStyle(
                                            color: Colors.green.shade700,
                                            fontWeight: FontWeight.bold))
                                    : TextButton(
                                        onPressed: () => _verify(row),
                                        child: Text(l.e2eeSfVerify),
                                      ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(row.lines.join('\n'),
                                style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 14,
                                    height: 1.8)),
                            if (row.changed)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text('⚠️ ${l.e2eeSfChanged}',
                                    style: const TextStyle(
                                        color: Color(0xFFB3261E),
                                        fontSize: HarborType.small)),
                              ),
                          ],
                        ),
                      ),
                    ),
                if (mine.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Text('${l.e2eeSfMyCode}:',
                      style: Theme.of(context).textTheme.bodySmall),
                  SelectableText(mine,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: HarborType.micro)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
