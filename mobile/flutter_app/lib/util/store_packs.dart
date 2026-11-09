// Store catalog parsing + pack card for the shopping tab.
//
// Both backend shapes parse here: Go rows carry
// {id,title,description,price_minor,currency,status} while worker packs carry
// {id,title,price_minor,stickers[],owned,currency}. Misshapen entries are
// skipped so one bad row never blanks the shelf.
import 'package:flutter/material.dart';

class StorePack {
  final String id;
  final String title;
  final String description;
  final int priceMinor;
  final String currency;
  final bool? owned;
  final List<String> stickers;
  const StorePack({
    required this.id,
    required this.title,
    this.description = '',
    this.priceMinor = 0,
    this.currency = 'KRW',
    this.owned,
    this.stickers = const [],
  });
}

List<StorePack> storePacksOf(dynamic json) {
  final packs = json is Map ? json['packs'] : null;
  if (packs is! List) return [];
  final out = <StorePack>[];
  for (final p in packs) {
    if (p is! Map) continue;
    final id = p['id'];
    final title = p['title'];
    if (id is! String || id.isEmpty) continue;
    if (title is! String || title.isEmpty) continue;
    final price = p['price_minor'];
    final currency = p['currency'];
    out.add(StorePack(
      id: id,
      title: title,
      description: p['description'] is String ? p['description'] as String : '',
      priceMinor: price is num ? price.toInt() : 0,
      currency: currency is String && currency.isNotEmpty ? currency : 'KRW',
      owned: p['owned'] is bool ? p['owned'] as bool : null,
      stickers:
          p['stickers'] is List ? (p['stickers'] as List).whereType<String>().toList() : const [],
    ));
  }
  return out;
}

String storePriceLabel(StorePack pack) =>
    pack.priceMinor <= 0 ? '무료' : '${pack.priceMinor} ${pack.currency}';

/// One shelf card: title, sticker strip, price or owned badge.
/// No purchase button: checkout is 503 fail-closed on both backends until a
/// verified payment provider exists, so the page says so instead of selling.
class StorePackCard extends StatelessWidget {
  final StorePack pack;
  final bool dark;
  const StorePackCard({super.key, required this.pack, required this.dark});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: dark ? const Color(0xFF1B2A4A) : Colors.white,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(pack.title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700)),
                ),
                if (pack.owned == true)
                  const Text('보유 중',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF22C55E)))
                else
                  Text(storePriceLabel(pack),
                      style: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w700)),
              ],
            ),
            if (pack.description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(pack.description,
                  style: const TextStyle(fontSize: 12, height: 1.4)),
            ],
            if (pack.stickers.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(pack.stickers.take(8).join(' '),
                  style: const TextStyle(fontSize: 20)),
            ],
          ],
        ),
      ),
    );
  }
}
