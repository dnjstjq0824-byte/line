// Route: /e2ee — E9: my E2EE devices with remote revoke, plus the
// passphrase-encrypted backup (store, restore, delete).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class E2eeSettingsPage extends StatefulWidget {
  const E2eeSettingsPage({super.key});

  @override
  State<E2eeSettingsPage> createState() => _E2eeSettingsPageState();
}

class _E2eeSettingsPageState extends State<E2eeSettingsPage> {
  final _pass = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final s = SessionScope.of(context, listen: false);
      s.loadE2eeDevices();
      s.loadBackupStatus();
    });
  }

  @override
  void dispose() {
    _pass.dispose();
    super.dispose();
  }

  String _strength(String p) {
    if (p.length < 8) return '';
    var score = 0;
    if (p.length >= 12) score++;
    if (p.length >= 20) score++;
    if (RegExp('[a-z]').hasMatch(p) && RegExp('[A-Z]').hasMatch(p)) score++;
    if (RegExp('[0-9]').hasMatch(p)) score++;
    if (RegExp('[^a-zA-Z0-9]').hasMatch(p)) score++;
    final l = context.l10n;
    return score <= 1 ? l.e2eeBkWeak : score <= 3 ? l.e2eeBkFair : l.e2eeBkStrong;
  }

  String _fmtSize(int n) {
    if (n >= 1048576) return '${(n / 1048576).toStringAsFixed(1)} MB';
    if (n >= 1024) return '${(n / 1024).toStringAsFixed(1)} KB';
    return '$n B';
  }

  String _shortId(String id) =>
      id.length > 18 ? '${id.substring(0, 8)}…${id.substring(id.length - 6)}' : id;

  Future<void> _confirmRevoke(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        content: Text(context.l10n.e2eeDevRevokeConfirm),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(false),
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(context.l10n.confirmWord),
          ),
        ],
      ),
    );
    if (ok == true && mounted) {
      await SessionScope.of(context, listen: false).revokeE2eeDevice(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final l = context.l10n;
    final st = session.e2eeBackupStatus;
    final statusLine = st == null
        ? l.e2eeBkNone
        : l.e2eeBkStatus(
            '${st['updated_at']}'.length >= 16
                ? '${st['updated_at']}'.substring(0, 16).replaceAll('T', ' ')
                : '${st['updated_at']}',
            _fmtSize((st['byte_len'] as num?)?.toInt() ?? 0));
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: l.backWord,
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Text(l.settingsEncryption),
      ),
      body: PageColumn(
        children: [
          Expanded(
            child: ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  child: Text(l.e2eeDevTitle,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                if (session.e2eeDevices.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Text(l.e2eeDevEmpty),
                  ),
                for (final d in session.e2eeDevices)
                  if (d is Map)
                    Card(
                      color: dark ? HarborDark.surface : Colors.white,
                      child: ListTile(
                        title: Text(_shortId('${d['device_id']}'),
                            style: const TextStyle(fontFamily: 'monospace')),
                        subtitle: '${d['device_id']}' == session.deviceId
                            ? Text(l.e2eeDevThis)
                            : Text('${d['updated_at'] ?? ''}'
                                        .length >=
                                    10
                                ? '${d['updated_at']}'.substring(0, 10)
                                : ''),
                        trailing: '${d['device_id']}' == session.deviceId
                            ? null
                            : TextButton(
                                onPressed: () =>
                                    _confirmRevoke('${d['device_id']}'),
                                child: Text(l.e2eeDevRevoke),
                              ),
                      ),
                    ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text(l.e2eeBkTitle,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(statusLine),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: TextField(
                    controller: _pass,
                    obscureText: true,
                    enableSuggestions: false,
                    autocorrect: false,
                    decoration: InputDecoration(labelText: l.e2eeBkPassPh),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                if (_strength(_pass.text).isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                    child: Text(_strength(_pass.text)),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      FilledButton(
                        onPressed: session.e2eeBackupBusy ||
                                _pass.text.length < 8
                            ? null
                            : () => session.backupE2eeNow(_pass.text),
                        child: Text(session.e2eeBackupBusy
                            ? l.e2eeBkBusy
                            : l.e2eeBkNow),
                      ),
                      OutlinedButton(
                        onPressed: session.e2eeBackupBusy ||
                                _pass.text.length < 8 ||
                                st == null
                            ? null
                            : () => session.restoreE2eeNow(_pass.text),
                        child: Text(session.e2eeBackupBusy
                            ? l.e2eeBkRestoring
                            : l.e2eeBkRestore),
                      ),
                      if (st != null)
                        TextButton(
                          onPressed: session.e2eeBackupBusy
                              ? null
                              : () => session.deleteE2eeBackup(),
                          child: Text(l.e2eeBkDelete),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
