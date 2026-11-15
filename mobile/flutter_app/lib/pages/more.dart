// Route: /more — secondary destination index for mobile/compact shells.
// Desktop and tablet reach these from the rail; this page keeps one tap
// away on small devices without merging anything into other pages.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../nav.dart';
import '../util/app_l10n.dart';

class MorePage extends StatelessWidget {
  const MorePage({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.mvMoreActions, subtitle: context.l10n.moreAllDesks),
            Card(
              color: dark ? HarborDark.surface : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(
                    color: dark ? HarborDark.channel : HarborLight.channel),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < LunoNav.secondary.length; i++) ...[
                    if (i > 0) const Divider(height: 1),
                    ListTile(
                      leading: Icon(LunoNav.secondary[i].icon),
                      title: Text(LunoNav.secondary[i].labelIn(context.l10n),
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      trailing: const Icon(Icons.chevron_right, size: 20),
                      onTap: () => context.go(LunoNav.secondary[i].route),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
