// LUNO Harbor V3 bootstrap.
//
// Thin entrypoint: theme + session + go_router. Feature code lives in
// pages/, shared logic in state/session.dart, HTTP in api/client.dart.
// Legacy names are re-exported so existing callers and tests keep working.
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:luno_messenger/l10n/app_localizations.dart';
import 'package:go_router/go_router.dart';

import 'design/v3.dart';
import 'pages/call_overlay.dart';
import 'pages/group_call_overlay.dart';
import 'router.dart';
import 'state/session.dart';
import 'util/deep_links.dart';
import 'util/error_report.dart';

export 'api/client.dart';
export 'legacy_tokens.dart';

// F22: framework + async errors land in first-party telemetry (masked).
void main() {
  FlutterError.onError = (details) {
    reportError(details.exception,
        {'surface': 'app', 'source': 'FlutterError', 'silent': details.silent});
    FlutterError.presentError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    reportError(error, {'surface': 'app', 'source': 'async'});
    return true;
  };
  runApp(const MessengerApp());
}

class MessengerApp extends StatefulWidget {
  const MessengerApp({super.key});

  @override
  State<MessengerApp> createState() => _MessengerAppState();
}

class _MessengerAppState extends State<MessengerApp>
    with WidgetsBindingObserver {
  late final SessionController _session;
  late final GoRouter _router;
  DeepLinkHandler? _links;
  String _appLocale = 'ko';

  @override
  void initState() {
    super.initState();
    _session = SessionController();
    _session.addListener(_syncLocale);
    _router = buildRouter(_session);
    // F21: warm links + shares (cold VIEW links ride the engine route).
    _links = DeepLinkHandler(session: _session, go: _router.go)..start();
    _session.restore();
    _session.checkForUpdate();
    _session.ensureTranslateLanguages();
    _session.notifyTap = (route) async => _router.go(route);
    _session.initNotifier();
    // F22: first-party telemetry upload (D1-backed /api/v1/telemetry, masked
    // at both ends). Logged-out clients keep data local only.
    setTelemetrySender(({required errors, required perf}) async {
      if (_session.api.token == null) return;
      await _session.api.call('/api/v1/telemetry', method: 'POST', data: {
        'reporter': 'app',
        'errors': errors.take(20).map((e) => e.toJson()).toList(),
        'perf': perf.take(50).map((s) => s.toJson()).toList(),
      });
    });
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
    _links?.dispose();
    // F22: the telemetry uploader is global; release it with the shell so no
    // flush timer outlives the widget tree (widget tests enforce this).
    setTelemetrySender(null);
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
