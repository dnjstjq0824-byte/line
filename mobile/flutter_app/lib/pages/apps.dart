// Route: /apps — LINE parity app-directory tab. A grid over the real
// secondary destinations; every tile navigates to a working page.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../nav.dart';
import '../util/app_l10n.dart';

class AppsPage extends StatelessWidget {
  const AppsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.appWord, subtitle: context.l10n.appsAllServices),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
                // UX4: the directory never lists itself.
                for (final d in LunoNav.secondary)
                  if (d.route != '/apps')
                    Card(
                      color: dark ? HarborDark.surface : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(HarborRadius.card),
                        side: BorderSide(
                            color: dark
                                ? HarborDark.channel
                                : HarborLight.channel),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(HarborRadius.card),
                        onTap: () => context.go(d.route),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(d.icon, size: 26),
                            const SizedBox(height: 6),
                            Text(d.labelIn(context.l10n),
                                style: const TextStyle(
                                    fontSize: HarborType.small,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}
