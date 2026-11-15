// LUNO Harbor V3 bootstrap.
//
// Thin entrypoint: theme + session + go_router. Feature code lives in
// pages/, shared logic in state/session.dart, HTTP in api/client.dart.
// Legacy names are re-exported so existing callers and tests keep working.
import 'package:flutter/material.dart';
import 'package:luno_messenger/l10n/app_localizations.dart';
import 'package:go_router/go_router.dart';

import 'design/v3.dart';
import 'pages/call_overlay.dart';
import 'pages/group_call_overlay.dart';
import 'router.dart';
import 'state/session.dart';

export 'api/client.dart';
export 'legacy_tokens.dart';

void main() => runApp(const MessengerApp());

class MessengerApp extends StatefulWidget {
  const MessengerApp({super.key});

  @override
  State<MessengerApp> createState() => _MessengerAppState();
}

class _MessengerAppState extends State<MessengerApp>
    with WidgetsBindingObserver {
  late final SessionController _session;
  late final GoRouter _router;
  String _appLocale = 'ko';

  @override
  void initState() {
    super.initState();
    _session = SessionController();
    _session.addListener(_syncLocale);
    _router = buildRouter(_session);
    _session.restore();
    _session.checkForUpdate();
    _session.ensureTranslateLanguages();
    _session.notifyTap = (route) async => _router.go(route);
    _session.initNotifier();
    WidgetsBinding.instance.addObserver(this);
  }

  // F20: rebuild the app shell only when the UI locale changes.
  void _syncLocale() {
    if (mounted && _appLocale != _session.locale) {
      setState(() => _appLocale = _session.locale);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _session.removeListener(_syncLocale);
    _session.disposeAll();
    super.dispose();
  }

  // N2-L: backgrounding ends any live call (no background hold).
  // N1-L: track foreground for notifications; resync on return.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _session.setForeground(true);
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached) {
      _session.setForeground(false);
      _session.onAppBackgrounded();
    }
  }

  @override
  Widget build(BuildContext context) {
    return SessionScope(
      notifier: _session,
      child: MaterialApp.router(
        title: 'LUNO',
        debugShowCheckedModeBanner: false,
        theme: LunoHarbor.theme(Brightness.light),
        darkTheme: LunoHarbor.theme(Brightness.dark),
        themeMode: ThemeMode.system,
        locale: Locale(_appLocale),
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        routerConfig: _router,
        builder: (context, child) => Stack(
          children: [child!, const CallOverlay(), const GroupCallOverlay()],
        ),
      ),
    );
  }
}
