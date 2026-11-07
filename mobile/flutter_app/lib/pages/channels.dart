// Route: /channels — official accounts, own page (was inside home).
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class ChannelsPage extends StatelessWidget {
  const ChannelsPage({super.key});

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
              Masthead(
                title: '공식 채널',
                subtitle: '인증된 항로 안내소 (${session.officialAccounts.length})',
              ),
              for (final oa in session.officialAccounts)
                Card(
                  color: dark ? HarborDark.surface : Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HarborRadius.card),
                    side: BorderSide(
                        color: dark ? HarborDark.channel : HarborLight.channel),
                  ),
                  child: ListTile(
                    leading: IdentityTile(
                      glyph: '${oa['badge'] ?? 'L'}',
                      color: dark ? HarborDark.harbor : HarborLight.harbor,
                    ),
                    title: Text('${oa['display_name']} ✓',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text('${oa['status_message'] ?? ''}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ),
                ),
              if (session.officialAccounts.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 64),
                  child: Text('등록된 공식 채널이 없습니다',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
