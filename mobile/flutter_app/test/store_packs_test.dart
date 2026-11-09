import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/store_packs.dart';

void main() {
  test('store parser reads the Go row shape', () {
    final packs = storePacksOf({
      'packs': [
        {
          'id': 'g1',
          'title': 'Cute Bear',
          'description': '곰돌이',
          'price_minor': 2500,
          'currency': 'KRW',
          'status': 'published'
        }
      ]
    });
    expect(packs.length, equals(1));
    expect(packs[0].id, equals('g1'));
    expect(packs[0].description, equals('곰돌이'));
    expect(packs[0].priceMinor, equals(2500));
    expect(packs[0].currency, equals('KRW'));
    expect(packs[0].owned, isNull);
    expect(packs[0].stickers, isEmpty);
  });

  test('store parser reads the worker pack shape', () {
    final packs = storePacksOf({
      'packs': [
        {
          'id': 'basic',
          'title': '기본 이모티콘',
          'price_minor': 0,
          'stickers': ['😀', '😂'],
          'owned': true,
          'currency': 'KRW'
        }
      ]
    });
    expect(packs.length, equals(1));
    expect(packs[0].owned, isTrue);
    expect(packs[0].stickers, equals(['😀', '😂']));
    expect(packs[0].description, equals(''));
  });

  test('store parser skips misshapen rows and defaults safely', () {
    final packs = storePacksOf({
      'packs': [
        {'id': '', 'title': 'no id'},
        {'id': 'x1'},
        'junk',
        {'id': 'ok', 'title': 'Ok', 'price_minor': 'free', 'currency': ''},
      ]
    });
    expect(packs.length, equals(1));
    expect(packs[0].id, equals('ok'));
    expect(packs[0].priceMinor, equals(0));
    expect(packs[0].currency, equals('KRW'));
    expect(storePacksOf({}), isEmpty);
    expect(storePacksOf({'packs': 'nope'}), isEmpty);
    expect(storePacksOf(null), isEmpty);
  });

  test('store price label honors free packs', () {
    expect(storePriceLabel(const StorePack(id: 'a', title: 'A')), equals('무료'));
    expect(
      storePriceLabel(const StorePack(id: 'b', title: 'B', priceMinor: 2500, currency: 'KRW')),
      equals('2500 KRW'),
    );
  });

  testWidgets('store pack card shows title price and owned badge', (WidgetTester tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Column(
          children: const [
            StorePackCard(
              pack: StorePack(id: 'p1', title: '유료팩', priceMinor: 2500),
              dark: false,
            ),
            StorePackCard(
              pack: StorePack(id: 'basic', title: '기본팩', owned: true),
              dark: false,
            ),
          ],
        ),
      ),
    ));
    expect(find.text('유료팩'), findsOneWidget);
    expect(find.text('2500 KRW'), findsOneWidget);
    expect(find.text('기본팩'), findsOneWidget);
    expect(find.text('보유 중'), findsOneWidget);
  });
}
