// F20: terse l10n access (ko/en/th/ja, same four as the web).
//
// Widget tests that pump pages without localization delegates still get
// Korean through the lookup fallback, so existing tests keep rendering
// (and passing) in Korean; the real app sets delegates + locale.
import 'package:flutter/widgets.dart';
import 'package:luno_messenger/l10n/app_localizations.dart';

export 'package:luno_messenger/l10n/app_localizations.dart';

/// App locales in settings order.
const appLocaleCodes = ['ko', 'en', 'th', 'ja'];

/// Native label per locale for the language picker.
const appLocaleNames = {
  'ko': '한국어',
  'en': 'English',
  'th': 'ไทย',
  'ja': '日本語',
};

extension L10nContext on BuildContext {
  AppLocalizations get l10n =>
      AppLocalizations.of(this) ?? lookupAppLocalizations(const Locale('ko'));
}

/// App locale code for helpers that take a locale string. Falls back to
/// Korean when no delegates are installed (widget tests), mirroring [l10n].
String appLocaleOf(BuildContext context) =>
    AppLocalizations.of(context)?.localeName ?? 'ko';

/// Context-free lookup for SessionController notices and pure helpers.
AppLocalizations stringsFor(String code) =>
    lookupAppLocalizations(Locale(appLocaleCodes.contains(code) ? code : 'ko'));
