import 'package:flutter/material.dart';

import '../design/v3.dart';

/// Harbor empty state: tinted icon tile (web lx-empty-icon language),
/// centered title, hint, and optional action.
class HarborEmpty extends StatelessWidget {
  const HarborEmpty(
      {super.key,
      required this.title,
      this.hint,
      this.action,
      this.icon = Icons.inbox_outlined,
      this.dense = false});

  final String title;
  final String? hint;
  final Widget? action;
  final IconData icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final tile = dense ? 48.0 : 64.0;
    return Padding(
      padding: EdgeInsets.symmetric(
          vertical: dense ? 12 : 48, horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: tile,
            height: tile,
            decoration: BoxDecoration(
              color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
              borderRadius: BorderRadius.circular(HarborRadius.card),
            ),
            child: Icon(icon,
                size: dense ? 24 : 28,
                color: dark ? HarborDark.harbor : HarborLight.harbor),
          ),
          const SizedBox(height: 12),
          Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
          if (hint != null) ...[
            const SizedBox(height: 4),
            Text(hint!, style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
          ],
          if (action != null) ...[const SizedBox(height: 12), action!],
        ],
      ),
    );
  }
}
