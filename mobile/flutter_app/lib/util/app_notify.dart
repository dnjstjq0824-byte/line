// N1-L: OS notifications for backgrounded app (messages + incoming calls).
//
// AppNotifier is the seam SessionController drives; ProdAppNotifier wraps
// flutter_local_notifications, and tests inject a recording fake. Payloads
// route taps: "room:<cid>" opens the room, "call:<id>" opens the call's
// room (the call overlay is already in the tree when the call is live).
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'app_l10n.dart';
import 'call_push.dart';

abstract class AppNotifier {
  Future<void> init({Future<void> Function(String? payload)? onTap, String locale = 'ko'});
  Future<void> showMessage(
      {required String roomId, required String title, required String body, String locale = 'ko'});
  /// Build 18: [kind] picks the voice/video wording; [ringToken] lets the
  /// lock-screen Decline button end the call without opening the app.
  Future<void> showIncomingCall(
      {required String callId,
      required String title,
      required String body,
      String locale = 'ko',
      String kind = 'voice',
      String ringToken = ''});
  Future<void> cancelCall();
}

class ProdAppNotifier implements AppNotifier {
  ProdAppNotifier([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  @override
  Future<void> init(
      {Future<void> Function(String? payload)? onTap,
      String locale = 'ko'}) async {
    const settings =
        InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher'));
    await _plugin.initialize(
      settings: settings,
      // Build 18: the ring's Accept button arrives as "accept:<payload>";
      // Decline never reaches here (it runs in a background isolate).
      onDidReceiveNotificationResponse: (response) =>
          onTap?.call(encodeResponse(response.payload, response.actionId)),
      onDidReceiveBackgroundNotificationResponse: lunoNotificationBackground,
    );
    final android =
        _plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    final s = stringsFor(locale);
    await android?.createNotificationChannel(AndroidNotificationChannel(
      'luno_messages',
      s.messageWord,
      description: s.notifMsgChannel,
      importance: Importance.high,
    ));
    await android?.createNotificationChannel(AndroidNotificationChannel(
      'luno_calls',
      s.notifCallChannel,
      description: s.notifCallDesc,
      importance: Importance.max,
    ));
  }

  @override
  Future<void> showMessage(
      {required String roomId,
      required String title,
      required String body,
      String locale = 'ko'}) {
    // (tag, id 0) is the identity FCM uses for the server's push
    // ("luno-room-<cid>"), so the two replace each other instead of stacking.
    return _plugin.show(
      id: 0,
      title: title,
      body: body,
      notificationDetails: NotificationDetails(
          android: AndroidNotificationDetails(
              'luno_messages', stringsFor(locale).messageWord,
              importance: Importance.high,
              priority: Priority.high,
              tag: 'luno-room-$roomId')),
      payload: 'room:$roomId',
    );
  }

  // Build 18: the same full-screen ring the closed-app push draws.
  @override
  Future<void> showIncomingCall(
      {required String callId,
      required String title,
      required String body,
      String locale = 'ko',
      String kind = 'voice',
      String ringToken = ''}) {
    return showRing(_plugin,
        callId: callId,
        ringToken: ringToken,
        callerName: title,
        kind: kind,
        locale: locale);
  }

  // Also clears the server's closed-app call push (same tag, id 0).
  @override
  Future<void> cancelCall() => clearRing(_plugin);
}
