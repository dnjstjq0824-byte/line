import 'package:flutter/material.dart';

import '../design/v3.dart';

enum HarborButtonVariant { primary, secondary, danger, ghost }

/// Harbor button: 44px minimum touch target, quiet corners, no glow.
class HarborButton extends StatelessWidget {
  const HarborButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = HarborButtonVariant.secondary,
    this.loading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final HarborButtonVariant variant;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final scheme = Theme.of(context).colorScheme;
    Color bg;
    Color fg;
    BorderSide side = BorderSide.none;
    switch (variant) {
      case HarborButtonVariant.primary:
        bg = scheme.primary;
        fg = scheme.onPrimary;
      case HarborButtonVariant.danger:
        bg = dark ? HarborDark.danger : HarborLight.danger;
        fg = Colors.white;
      case HarborButtonVariant.ghost:
        bg = Colors.transparent;
        fg = scheme.primary;
      case HarborButtonVariant.secondary:
        bg = scheme.surface;
        fg = scheme.onSurface;
        side = BorderSide(color: scheme.outline);
    }
    final disabled = onPressed == null || loading;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 44),
      child: TextButton(
        onPressed: disabled ? null : onPressed,
        style: TextButton.styleFrom(
          backgroundColor: disabled ? bg.withValues(alpha: 0.55) : bg,
          foregroundColor: fg,
          side: side,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(HarborRadius.control),
          ),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
        child: loading
            ? SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(strokeWidth: 2, color: fg),
              )
            : Text(label),
      ),
    );
  }
}
