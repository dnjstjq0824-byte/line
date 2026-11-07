import 'package:flutter/material.dart';

import '../design/v3.dart';

/// Harbor card: surface panel with hairline border and a quiet shadow.
class HarborCard extends StatelessWidget {
  const HarborCard({super.key, required this.child, this.padding = 14});

  final Widget child;
  final double padding;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? HarborDark.surface : HarborLight.surface,
        borderRadius: BorderRadius.circular(HarborRadius.card),
        border: Border.all(color: dark ? HarborDark.channel : HarborLight.channel),
        boxShadow: dark ? HarborShadow.mdDark : HarborShadow.md,
      ),
      child: Padding(padding: EdgeInsets.all(padding), child: child),
    );
  }
}
