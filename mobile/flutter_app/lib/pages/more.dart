// Route: /more — the fifth phone tab. Same layout as the web "More" panel:
// my profile, every other destination as a named icon, then logout.
// Desktop and tablet reach these from the rail.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../nav.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? context.l10n.myProfile : session.selfName;
    // Operator console is a staff tool, not part of the messenger.
    final items = LunoNav.secondary
        .where((d) => d.route != '/console' || session.selfRole == 'admin')
        .toList();
    final line = dark ? HarborDark.channel : HarborLight.channel;
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.mvMoreActions),
            Material(
              color: dark ? HarborDark.surface : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(color: line),
              ),
              child: InkWell(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                onTap: () => context.go('/profile'),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: [
                      IdentityTile(
                        glyph: name,
                        color: dark ? HarborDark.harbor : HarborLight.harbor,
                        size: 48,
                        photo: SessionScope.of(context).photoOf(
                            SessionScope.of(context).selfAvatarUrl),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 16, fontWeight: FontWeight.w800)),
                            if (session.selfStatusMessage.isNotEmpty)
                              Text(session.selfStatusMessage,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: Theme.of(context).textTheme.bodySmall),
                          ],
                        ),
                      ),
                      Icon(Icons.chevron_right,
                          color: dark ? HarborDark.drift : HarborLight.drift),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, box) {
                final columns = box.maxWidth >= 520 ? 6 : 4;
                return GridView.count(
                  crossAxisCount: columns,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 4,
                  crossAxisSpacing: 4,
                  childAspectRatio: 0.9,
                  children: [
                    for (final d in items) _MoreTile(destination: d),
                  ],
                );
              },
            ),
            const SizedBox(height: 16),
            OutlinedButton(
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(48),
                foregroundColor: dark ? HarborDark.danger : HarborLight.danger,
                side: BorderSide(color: line),
              ),
              onPressed: () => SessionScope.of(context, listen: false).logout(),
              child: Text(context.l10n.mvLogout,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
          ],
        ),
      ],
    );
  }
}

class _MoreTile extends StatelessWidget {
  final LunoDestination destination;
  const _MoreTile({required this.destination});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final label = destination.labelIn(context.l10n);
    return InkWell(
      borderRadius: BorderRadius.circular(HarborRadius.control),
      onTap: () => context.go(destination.route),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(destination.icon,
                color: dark ? HarborDark.harbor : HarborLight.harbor),
          ),
          const SizedBox(height: 6),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: HarborType.small, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
