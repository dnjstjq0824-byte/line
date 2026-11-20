// Routes: /console, /console/users, /console/reports, /console/flags,
// /console/audit — harbourmaster desks. Same V3 system as user pages.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../widgets/no_pull_refresh.dart';
import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

void _loadOnce(BuildContext context, Future<void> Function() load) {
  WidgetsBinding.instance.addPostFrameCallback((_) => load());
}

class ConsolePage extends StatelessWidget {
  const ConsolePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    _loadOnce(context, SessionScope.of(context, listen: false).loadAdminStats);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final kind = DeviceScope.of(context);
    final metrics = (session.adminStats?['metrics'] as Map<String, dynamic>?) ?? {};
    final desks = [
      ('/console/users', context.l10n.userWord, context.l10n.consoleUsers, Icons.people_outline),
      ('/console/reports', context.l10n.reportWord, context.l10n.consoleSafetyBox, Icons.shield_outlined),
      ('/console/flags', context.l10n.flagWord, context.l10n.consoleSwitches, Icons.toggle_on_outlined),
      ('/console/audit', context.l10n.consoleAuditLog, context.l10n.consoleLedger, Icons.history),
    ];
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.consoleTitle, subtitle: context.l10n.consoleHarborDesk),
            if (metrics.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(context.l10n.consoleNoMetrics,
                    style: Theme.of(context).textTheme.bodySmall),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount:
                      kind == DeviceKind.desktop ? 4 : (kind == DeviceKind.compactApp ? 2 : 3),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.5,
                ),
                itemCount: metrics.length,
                itemBuilder: (_, i) {
                  final key = metrics.keys.elementAt(i);
                  return Card(
                    color: dark ? HarborDark.surface : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.card),
                      side: BorderSide(
                          color: dark ? HarborDark.channel : HarborLight.channel),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('${metrics[key]}',
                              style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w900,
                                  fontFeatures: [FontFeature.tabularFigures()])),
                          const SizedBox(height: 2),
                          Text(key,
                              style: Theme.of(context).textTheme.bodySmall,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                  );
                },
              ),
            const SizedBox(height: 16),
            for (final desk in desks)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Card(
                  color: dark ? HarborDark.surface : Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HarborRadius.card),
                    side: BorderSide(
                        color: dark ? HarborDark.channel : HarborLight.channel),
                  ),
                  child: ListTile(
                    leading: Icon(desk.$4),
                    title: Text(desk.$2,
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(desk.$3,
                        style: Theme.of(context).textTheme.bodySmall),
                    trailing: const Icon(Icons.chevron_right, size: 20),
                    onTap: () => context.go(desk.$1),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class ConsoleUsersPage extends StatelessWidget {
  const ConsoleUsersPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    _loadOnce(context, SessionScope.of(context, listen: false).loadAdminUsers);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return NoPullRefresh(
      onRefresh: session.loadAdminUsers,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: context.l10n.userWord,
                  subtitle: context.l10n.adminUsersCount(session.adminUsers.length)),
              for (final u in session.adminUsers)
                Card(
                  color: dark ? HarborDark.surface : Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HarborRadius.card),
                    side: BorderSide(
                        color: dark ? HarborDark.channel : HarborLight.channel),
                  ),
                  child: ListTile(
                    leading: IdentityTile(
                      glyph: '${u['display_name'] ?? '?'}',
                      color: dark ? HarborDark.harbor : HarborLight.harbor,
                    ),
                    title: Text('${u['display_name']}',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text("${u['email']} · ${u['role']} · ${u['state']}",
                        style: Theme.of(context).textTheme.bodySmall),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class ConsoleReportsPage extends StatelessWidget {
  const ConsoleReportsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    _loadOnce(context, SessionScope.of(context, listen: false).loadAdminReports);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return NoPullRefresh(
      onRefresh: session.loadAdminReports,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: context.l10n.reportWord,
                  subtitle: context.l10n.adminReportsCount(session.adminReports.length)),
              for (final r in session.adminReports)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    color: dark ? HarborDark.surface : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.card),
                      side: BorderSide(
                          color: dark ? HarborDark.channel : HarborLight.channel),
                    ),
                    child: ListTile(
                      leading: Icon(
                        r['state'] == 'open'
                            ? Icons.flag
                            : Icons.flag_outlined,
                        color: r['state'] == 'open'
                            ? (dark ? HarborDark.beacon : HarborLight.beacon)
                            : null,
                      ),
                      title: Text("${r['category']} · ${r['state']}",
                          style:
                              const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text('${r['details']}',
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.bodySmall),
                      trailing: FilledButton.tonal(
                        onPressed: () => _moderationDialog(
                            context, '${r['id'] ?? ''}'),
                        child: Text(context.l10n.consoleAct),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _moderationDialog(BuildContext context, String reportId) {
    final subject = TextEditingController();
    final reason = TextEditingController();
    var action = 'warn';
    showDialog<void>(
      context: context,
      builder: (dialog) => StatefulBuilder(
        builder: (dialog, setDialog) => AlertDialog(
          title: Text(context.l10n.consoleModAction),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: subject,
                  decoration: InputDecoration(
                      labelText: context.l10n.consoleTargetUuid, isDense: true)),
              SizedBox(height: 8),
              DropdownButton<String>(
                value: action,
                isExpanded: true,
                items: [
                  DropdownMenuItem(value: 'warn', child: Text(context.l10n.modWarn)),
                  DropdownMenuItem(value: 'suspend', child: Text(context.l10n.modSuspend)),
                  DropdownMenuItem(value: 'activate', child: Text(context.l10n.modRestore)),
                  DropdownMenuItem(value: 'dismiss', child: Text(context.l10n.modDismiss)),
                ],
                onChanged: (v) {
                  if (v != null) setDialog(() => action = v);
                },
              ),
              const SizedBox(height: 8),
              TextField(
                  controller: reason,
                  decoration: InputDecoration(
                      labelText: context.l10n.reasonOptional, isDense: true)),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(dialog).pop(),
                child: Text(context.l10n.mvCancel)),
            FilledButton(
              onPressed: () {
                Navigator.of(dialog).pop();
                SessionScope.of(context, listen: false).moderationAction(
                  subjectUserId: subject.text.trim(),
                  action: action,
                  reportId: reportId,
                  reason: reason.text.trim(),
                );
              },
              child: Text(context.l10n.logWord),
            ),
          ],
        ),
      ),
    );
  }
}

class ConsoleFlagsPage extends StatelessWidget {
  const ConsoleFlagsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    _loadOnce(context, SessionScope.of(context, listen: false).loadFeatureFlags);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return NoPullRefresh(
      onRefresh: session.loadFeatureFlags,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.flagWord, subtitle: context.l10n.consoleFlagPanel),
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(
                      color: dark ? HarborDark.channel : HarborLight.channel),
                ),
                child: Column(
                  children: [
                    for (var i = 0;
                        i < session.featureFlags.length;
                        i++) ...[
                      if (i > 0) const Divider(height: 1),
                      SwitchListTile(
                        title: Text('${session.featureFlags[i]['key']}',
                            style: const TextStyle(
                                fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text(
                            context.l10n.flagUpdatedAt(SessionScope.of(context, listen: false).relTime(session.featureFlags[i]['updated_at'])),
                            style: Theme.of(context).textTheme.bodySmall),
                        value:
                            session.featureFlags[i]['enabled'] == true,
                        onChanged: (v) =>
                            SessionScope.of(context, listen: false)
                                .upsertFeatureFlag(
                                    '${session.featureFlags[i]['key']}', v),
                      ),
                    ],
                    if (session.featureFlags.isEmpty)
                      Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(context.l10n.consoleNoFlags),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class ConsoleAuditPage extends StatelessWidget {
  const ConsoleAuditPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    _loadOnce(
        context, SessionScope.of(context, listen: false).loadAdminAuditLogs);
    return NoPullRefresh(
      onRefresh: session.loadAdminAuditLogs,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: context.l10n.consoleAuditLog,
                  subtitle: context.l10n.adminAuditCount(session.adminAuditLogs.length)),
              for (var i = 0; i < session.adminAuditLogs.length; i++) ...[
                if (i > 0) const Divider(height: 1),
                ListTile(
                  dense: true,
                  title: Text('${session.adminAuditLogs[i]['action']}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13)),
                  subtitle: Text(
                      "${session.adminAuditLogs[i]['target_type']}:${session.adminAuditLogs[i]['target_id']} · ${session.relTime(session.adminAuditLogs[i]['created_at'])}",
                      style: Theme.of(context).textTheme.bodySmall),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
