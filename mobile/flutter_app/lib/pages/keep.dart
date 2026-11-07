// Route: /keep — LUNO Keep locker. Previously write-only from chat;
// the stored list (GET /api/v1/bookmarks) finally has its own page.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class KeepPage extends StatelessWidget {
  const KeepPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: 'Keep', subtitle: '보관한 신호 모음'),
              if (session.bookmarks.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Column(
                    children: [
                      Icon(Icons.bookmark_outline,
                          size: 44,
                          color: dark ? HarborDark.channel : HarborLight.channel),
                      const SizedBox(height: 12),
                      Text('보관한 항목이 없습니다',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('대화방에서 책갈피 표시로 보관하세요',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
              for (final b in session.bookmarks)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Card(
                    color: dark ? HarborDark.surface : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.card),
                      side: BorderSide(
                          color: dark ? HarborDark.channel : HarborLight.channel),
                    ),
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
