import 'package:flutter/material.dart';

import '../design/v3.dart';

/// Harbor empty state: centered title, hint, and optional action.
class HarborEmpty extends StatelessWidget {
  const HarborEmpty({super.key, required this.title, this.hint, this.action, this.icon = Icons.inbox_outlined});

  final String title;
  final String? hint;
  final Widget? action;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44, color: dark ? HarborDark.channel : HarborLight.channel),
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
