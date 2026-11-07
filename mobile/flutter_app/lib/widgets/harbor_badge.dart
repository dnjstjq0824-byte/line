import 'package:flutter/material.dart';

import '../design/v3.dart';

enum HarborBadgeTone { info, success, warning, danger, muted }

/// Harbor badge: small pill label in a status tone.
class HarborBadge extends StatelessWidget {
  const HarborBadge({super.key, required this.label, this.tone = HarborBadgeTone.muted});

  final String label;
  final HarborBadgeTone tone;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    late final Color bg;
    late final Color fg;
    switch (tone) {
      case HarborBadgeTone.info:
        bg = dark ? HarborDark.seaGlass : HarborLight.seaGlass;
        fg = dark ? HarborDark.harbor : HarborLight.harbor;
      case HarborBadgeTone.success:
        bg = dark ? HarborDark.seaGlass : HarborLight.seaGlass;
        fg = dark ? HarborDark.success : HarborLight.success;
      case HarborBadgeTone.warning:
        bg = dark ? HarborDark.buoyBg : HarborLight.buoyBg;
        fg = dark ? HarborDark.warning : HarborLight.warning;
      case HarborBadgeTone.danger:
        bg = dark ? HarborDark.buoyBg : const Color(0xFFFDE8E8);
        fg = dark ? HarborDark.danger : HarborLight.danger;
      case HarborBadgeTone.muted:
        bg = dark ? HarborDark.chart : HarborLight.chart;
        fg = dark ? HarborDark.drift : HarborLight.drift;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(HarborRadius.lamp)),
      child: Text(label, style: TextStyle(fontSize: HarborType.small, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}
