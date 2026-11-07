// Canonical app theme entry point. Design tokens live in design/v3.dart
// (Harbor tokens, mirrored with apps/shared/design-v3.tokens.json); this
// facade exposes ready ThemeData plus brightness-aware status colors.
import 'package:flutter/material.dart';

import '../design/v3.dart';

abstract final class AppTheme {
  static ThemeData get light => LunoHarbor.theme(Brightness.light);
  static ThemeData get dark => LunoHarbor.theme(Brightness.dark);

  static Color successOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? HarborDark.success : HarborLight.success;
  static Color warningOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? HarborDark.warning : HarborLight.warning;
  static Color infoOf(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? HarborDark.info : HarborLight.info;
}
