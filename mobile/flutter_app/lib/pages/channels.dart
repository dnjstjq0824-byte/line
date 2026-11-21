// Route: /channels — official accounts, own page (was inside home).
import 'package:flutter/material.dart';

import '../widgets/no_pull_refresh.dart';
import '../widgets/harbor_empty.dart';
import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class ChannelsPage extends StatelessWidget {
  const ChannelsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return NoPullRefresh(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                title: context.l10n.officialChannels,
                subtitle: session.officialAccounts.isEmpty
                    ? null
                    : context.l10n
                        .oaDirectory(session.officialAccounts.length),
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
                HarborEmpty(
                  title: context.l10n.channelsEmpty,
                  icon: Icons.verified_outlined,
                ),
            ],
          ),
        ],
      ),
    );
  }
}
