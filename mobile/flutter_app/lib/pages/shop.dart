// Route: /shop — LINE parity shopping tab.
// LUNO has no commerce backend yet, so this page honestly reports
// "preparing" instead of showing fake products.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';

class ShopPage extends StatelessWidget {
  const ShopPage({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return ListView(
      children: [
        PageColumn(
          children: [
            const Masthead(title: '쇼핑', subtitle: 'LUNO 쇼핑'),
            Card(
              color: dark ? HarborDark.surface : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(
                    color: dark ? HarborDark.channel : HarborLight.channel),
              ),
              child: const Padding(
                padding: EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.shopping_bag_outlined, size: 20),
                        SizedBox(width: 8),
                        Text('쇼핑 준비 중',
                            style: TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700)),
                      ],
                    ),
                    SizedBox(height: 8),
                    Text(
                      '상점·결제 연동이 아직 없어 상품을 판매하지 않습니다. '
                      '입점·결제 백엔드가 준비되면 이 탭에서 상품을 만나볼 수 있습니다.',
                      style: TextStyle(height: 1.5),
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
