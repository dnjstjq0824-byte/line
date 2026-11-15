// Route: /shop — LINE parity shopping tab.
// Renders the real sticker-pack catalog from GET /api/v1/store/stickers.
// Checkout is 503 fail-closed on both backends (no verified payment
// provider), so this page browses and says so instead of selling.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/store_packs.dart';
import '../util/app_l10n.dart';

class ShopPage extends StatelessWidget {
  const ShopPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final packs = session.storePacks;
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.mvRailShop, subtitle: context.l10n.shopTitle),
            if (packs.isEmpty)
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(
                      color: dark ? HarborDark.channel : HarborLight.channel),
                ),
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Icon(Icons.storefront_outlined, size: 20),
                      SizedBox(width: 8),
                      Text(context.l10n.shopEmpty,
                          style: TextStyle(
                              fontSize: HarborType.body, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              ),
            for (final p in packs) StorePackCard(pack: p, dark: dark),
            Card(
              color: dark ? HarborDark.surface : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(
                    color: dark ? HarborDark.channel : HarborLight.channel),
              ),
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Row(
                  children: [
                    Icon(Icons.payments_outlined, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        context.l10n.shopPreparing,
                        style: TextStyle(height: 1.5),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
