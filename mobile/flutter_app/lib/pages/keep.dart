// Route: /keep — LUNO Keep locker, backed by GET /api/v1/saved-messages.

import 'package:flutter/material.dart';

import '../design/responsive.dart';

import '../state/session.dart';
import '../widgets/harbor_card.dart';
import '../widgets/harbor_empty.dart';

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
              const Masthead(title: 'Keep', subtitle: '보관한 신호 모음'),
              if (session.bookmarks.isEmpty)
                const HarborEmpty(
                  title: '보관한 항목이 없습니다',
                  hint: '대화방에서 책갈피 표시로 보관하세요',
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
