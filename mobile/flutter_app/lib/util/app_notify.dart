// N1-L: OS notifications for backgrounded app (messages + incoming calls).
//
// AppNotifier is the seam SessionController drives; ProdAppNotifier wraps
// flutter_local_notifications, and tests inject a recording fake. Payloads
// route taps: "room:<cid>" opens the room, "call:<id>" opens the call's
// room (the call overlay is already in the tree when the call is live).
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

abstract class AppNotifier {
  Future<void> init({Future<void> Function(String? payload)? onTap});
  Future<void> showMessage(
      {required String roomId, required String title, required String body});
  Future<void> showIncomingCall(
      {required String callId, required String title, required String body});
  Future<void> cancelCall();
}

class ProdAppNotifier implements AppNotifier {
  ProdAppNotifier([FlutterLocalNotificationsPlugin? plugin])
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  static const _msgChannel = AndroidNotificationChannel(
    'luno_messages',
    '메시지',
    description: '새 메시지 알림',
    importance: Importance.high,
  );
  static const _callChannel = AndroidNotificationChannel(
    'luno_calls',
    '전화',
    description: '수신 전화 알림',
    importance: Importance.max,
  );
  static const _callId = 9001;

  @override
  Future<void> init({Future<void> Function(String? payload)? onTap}) async {
    const settings =
        InitializationSettings(android: AndroidInitializationSettings('@mipmap/ic_launcher'));
    await _plugin.initialize(
      settings: settings,
      onDidReceiveNotificationResponse: (response) =>
          onTap?.call(response.payload),
    );
    final android =
        _plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(_msgChannel);
    await android?.createNotificationChannel(_callChannel);
  }

  @override
  Future<void> showMessage(
      {required String roomId,
      required String title,
      required String body}) {
    return _plugin.show(
      id: roomId.hashCode,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
              'luno_messages', '메시지',
              importance: Importance.high, priority: Priority.high)),
      payload: 'room:$roomId',
    );
  }

  @override
  Future<void> showIncomingCall(
      {required String callId,
      required String title,
      required String body}) {
    return _plugin.show(
      id: _callId,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
          android: AndroidNotificationDetails(
              'luno_calls', '전화',
              importance: Importance.max,
              priority: Priority.max,
              ongoing: true,
              autoCancel: false)),
      payload: 'call:$callId',
    );
  }

  @override
  Future<void> cancelCall() => _plugin.cancel(id: _callId);
}
