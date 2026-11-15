// Route: /reports — my filed reports with processing states.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key});

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SessionScope.of(context, listen: false).loadMyReports();
    });
  }

  String _stateLabel(String state) {
    switch (state) {
      case 'resolved':
        return context.l10n.reportStateResolved;
      case 'dismissed':
        return context.l10n.reportStateDismissed;
      default:
        return context.l10n.reportStateOpen;
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Text(context.l10n.reportHistoryTitle),
      ),
      body: PageColumn(
        children: [
          Expanded(
            child: session.myReports.isEmpty
                ? Center(child: Text(context.l10n.reportHistoryEmpty))
                : ListView(
                    children: [
                      for (final r in session.myReports)
                        if (r is Map)
                          Card(
                            color: dark ? HarborDark.surface : Colors.white,
                            child: ListTile(
                              title: Text('${r['category'] ?? ''}'),
                              subtitle: Text(
                                  '${r['details'] ?? ''}\n${_stateLabel('${r['state']}')}'),
                              isThreeLine: true,
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
