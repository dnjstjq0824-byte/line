// LUNO Harbor V3 bootstrap.
//
// Thin entrypoint: theme + session + go_router. Feature code lives in
// pages/, shared logic in state/session.dart, HTTP in api/client.dart.
// Legacy names are re-exported so existing callers and tests keep working.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'design/v3.dart';
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

class _MessengerAppState extends State<MessengerApp> {
  late final SessionController _session;
  late final GoRouter _router;

  @override
  void initState() {
    super.initState();
    _session = SessionController();
    _router = buildRouter(_session);
    _session.restore();
  }

  @override
  void dispose() {
    _session.disposeAll();
    super.dispose();
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
        routerConfig: _router,
      ),
    );
  }
}
