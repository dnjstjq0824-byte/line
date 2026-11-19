// FCM device registration (closed-app push). PushRegistrar is the seam
// SessionController drives; tests inject a recording fake. ProdPushRegistrar
// is a no-op off Android (host tests, web) and swallows Firebase errors, so
// push can never block login. The server sends notification messages tagged
// "luno-room-<cid>" / "luno-call", the same identity AppNotifier uses.
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

abstract class PushRegistrar {
  /// Starts Firebase, asks for the notification permission and returns the
  /// current FCM token (null when unavailable). [onRefresh] fires with new
  /// tokens; [onOpen] fires with the conversation id of a tapped push.
  Future<String?> start({
    required void Function(String token) onRefresh,
    required void Function(String conversationId) onOpen,
  });

  /// Stops listening (logout).
  Future<void> stop();
}

class ProdPushRegistrar implements PushRegistrar {
  bool _ready = false;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openSub;

  bool get _supported =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  @override
  Future<String?> start({
    required void Function(String token) onRefresh,
    required void Function(String conversationId) onOpen,
  }) async {
    if (!_supported) return null;
    try {
      if (!_ready) {
        await Firebase.initializeApp();
        _ready = true;
      }
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      await _refreshSub?.cancel();
      // Registration tokens (getToken/onTokenRefresh) are what the server's
      // FCM HTTP v1 sender targets. firebase_messaging 17 marks them deprecated
      // in favour of register()/onRegistered (FID direct-send), a different
      // server contract; switch both ends together, not the app alone.
      // ignore: deprecated_member_use
      _refreshSub = messaging.onTokenRefresh.listen(onRefresh);
      void open(RemoteMessage m) {
        final cid = '${m.data['conversation_id'] ?? ''}';
        if (cid.isNotEmpty) onOpen(cid);
      }

      await _openSub?.cancel();
      _openSub = FirebaseMessaging.onMessageOpenedApp.listen(open);
      final initial = await messaging.getInitialMessage();
      if (initial != null) open(initial);
      // ignore: deprecated_member_use
      return await messaging.getToken();
    } catch (_) {
      return null;
    }
  }

  // The server forgets this device's token on logout (DELETE push-tokens), so
  // nothing is sent to it; the device token itself stays valid and is simply
  // re-registered on the next login.
  @override
  Future<void> stop() async {
    await _refreshSub?.cancel();
    _refreshSub = null;
    await _openSub?.cancel();
    _openSub = null;
  }
}
