// Route: /shop — LINE parity shopping tab.
// Renders the real sticker-pack catalog from GET /api/v1/store/stickers.
// Checkout is 503 fail-closed on both backends (no verified payment
// provider), so this page browses and says so instead of selling.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/store_packs.dart';

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
            const Masthead(title: '쇼핑', subtitle: 'LUNO 쇼핑'),
            if (packs.isEmpty)
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(
                      color: dark ? HarborDark.channel : HarborLight.channel),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Icon(Icons.storefront_outlined, size: 20),
                      SizedBox(width: 8),
                      Text('등록된 상품이 없습니다',
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w700)),
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
              child: const Padding(
                padding: EdgeInsets.all(20),
                child: Row(
                  children: [
                    Icon(Icons.payments_outlined, size: 20),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '결제 연동 준비 중이라 둘러보기만 가능합니다. 구매는 결제사가 연동되면 열립니다.',
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
