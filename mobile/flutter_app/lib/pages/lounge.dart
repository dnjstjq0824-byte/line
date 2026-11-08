// Route: /lounge — open community rooms, own page.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class LoungePage extends StatelessWidget {
  const LoungePage({super.key});

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
              const Masthead(title: '라운지', subtitle: 'LUNO 글로벌 라운지 커뮤니티'),
              for (final r in session.openRooms)
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
                      leading: IdentityTile(
                        glyph: '${r['title'] ?? 'L'}',
                        color: dark ? HarborDark.harbor : HarborLight.harbor,
                      ),
                      title: Text("${r['title'] ?? '라운지'}",
                          style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(
                          "${r['description'] ?? ''} · 참여자 ${r['member_count'] ?? 1}명",
                          style: Theme.of(context).textTheme.bodySmall),
                      trailing: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                          borderRadius:
                              BorderRadius.circular(HarborRadius.lamp),
                        ),
                        child: Text('공개 라운지',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: dark ? HarborDark.ink : HarborLight.harbor)),
                      ),
                    ),
                  ),
                ),
              if (session.openRooms.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CrewBadge.mascot(),
                      const SizedBox(height: 12),
                      Text('개설된 라운지가 없습니다',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium),
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
