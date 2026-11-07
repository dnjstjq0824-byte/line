// Routes: /console, /console/users, /console/reports, /console/flags,
// /console/audit — harbourmaster desks. Same V3 system as user pages.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

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
    const desks = [
      ('/console/users', '사용자', '계정 명부', Icons.people_outline),
      ('/console/reports', '신고', '안전 신고함', Icons.shield_outlined),
      ('/console/flags', '플래그', '기능 스위치', Icons.toggle_on_outlined),
      ('/console/audit', '감사 로그', '불변 기록부', Icons.history),
    ];
    return ListView(
      children: [
        PageColumn(
          children: [
            const Masthead(title: '콘솔', subtitle: '하버마스터 관제 데스크'),
            if (metrics.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text('지표를 불러오는 중이거나 권한이 없습니다',
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
    return RefreshIndicator(
      onRefresh: session.loadAdminUsers,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: '사용자',
                  subtitle: '계정 명부 ${session.adminUsers.length}건'),
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
    return RefreshIndicator(
      onRefresh: session.loadAdminReports,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: '신고',
                  subtitle: '안전 신고함 ${session.adminReports.length}건'),
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
                        child: const Text('조치'),
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
          title: const Text('모더레이션 조치'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: subject,
                  decoration: const InputDecoration(
                      labelText: '대상 사용자 UUID', isDense: true)),
              const SizedBox(height: 8),
              DropdownButton<String>(
                value: action,
                isExpanded: true,
                items: const [
                  DropdownMenuItem(value: 'warn', child: Text('경고')),
                  DropdownMenuItem(value: 'suspend', child: Text('정지')),
                  DropdownMenuItem(value: 'activate', child: Text('복구')),
                  DropdownMenuItem(value: 'dismiss', child: Text('기각')),
                ],
                onChanged: (v) {
                  if (v != null) setDialog(() => action = v);
                },
              ),
              const SizedBox(height: 8),
              TextField(
                  controller: reason,
                  decoration: const InputDecoration(
                      labelText: '사유 (선택)', isDense: true)),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.of(dialog).pop(),
                child: const Text('취소')),
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
              child: const Text('기록'),
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
    return RefreshIndicator(
      onRefresh: session.loadFeatureFlags,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '플래그', subtitle: '기능 스위치 제어반'),
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
                            '업데이트: ${SessionScope.of(context, listen: false).relTime(session.featureFlags[i]['updated_at'])}',
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
                      const Padding(
                        padding: EdgeInsets.all(24),
                        child: Text('등록된 플래그가 없습니다'),
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
    return RefreshIndicator(
      onRefresh: session.loadAdminAuditLogs,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                  title: '감사 로그',
                  subtitle: '불변 기록부 ${session.adminAuditLogs.length}건'),
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
