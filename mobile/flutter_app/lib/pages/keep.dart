// Route: /keep — LUNO Keep locker, backed by GET /api/v1/saved-messages.

import 'package:flutter/material.dart';

import '../design/responsive.dart';

import '../state/session.dart';
import '../widgets/harbor_card.dart';
import '../widgets/harbor_empty.dart';
import '../util/app_l10n.dart';

class KeepPage extends StatelessWidget {
  const KeepPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: 'Keep', subtitle: context.l10n.keepTitle),
              if (session.bookmarks.isEmpty)
                HarborEmpty(
                  title: context.l10n.keepEmpty,
                  hint: context.l10n.keepHint,
                  icon: Icons.bookmark_outline,
                ),
              for (final b in session.bookmarks)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: HarborCard(
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text("${b['note'] ?? b['body'] ?? ''}",
                              style: const TextStyle(height: 1.45)),
                          if ('${b['created_at'] ?? ''}'.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(session.relTime(b['created_at']),
                                style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ],
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
}
