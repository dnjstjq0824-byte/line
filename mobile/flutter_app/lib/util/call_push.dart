// Build 18: calls that reach the phone like a phone call.
//
// - Ring: the server's call push is data-only, so this code (not the system)
//   draws it: a full-screen, insistent-ringtone notification in the "call"
//   category with Decline / Accept. Over a locked screen Android opens the
//   app's call screen directly (MainActivity shows itself over the lock
//   screen for call intents); on an unlocked phone it is a heads-up.
// - Decline runs in a background isolate without opening the app. That
//   isolate has no session, so it uses the per-call ring token the server
//   sent with the ring (POST calls/:id/ring-decline).
// - call_end push: the caller gave up or another device answered, so the
//   ring disappears.
// - Keep-alive: while a call is live the app runs a microphone (+ camera)
//   foreground service, so turning the screen off or leaving the app no
//   longer cuts the call.
import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;

import '../legacy_tokens.dart';
import 'app_l10n.dart';

/// (luno-call, 0): one identity for the ring, whichever path showed it (the
/// live socket or the push), so they replace each other instead of stacking.
const callRingId = 0;
const callRingTag = 'luno-call';

/// Channel for the ring. New in build 18: a channel's sound is fixed when it
/// is created, and the old 'luno_calls' channel had the plain notification
/// sound.
const callRingChannel = 'luno_ring';

/// Ongoing-call (foreground service) notification.
const callOngoingChannel = 'luno_ongoing_call';
const callOngoingId = 7;

/// A ring this old is not worth showing (the caller hangs up at 45 s).
const callRingMaxAge = Duration(seconds: 45);

const actionAccept = 'accept';
const actionDecline = 'decline';

/// Notification payload of a ring: `call:<id>|<ring token>`.
String ringPayload(String callId, String ringToken) =>
    ringToken.isEmpty ? 'call:$callId' : 'call:$callId|$ringToken';

/// (call id, ring token) from a ring payload, or null for anything else.
({String callId, String ringToken})? parseRingPayload(String? payload) {
  if (payload == null || !payload.startsWith('call:')) return null;
  final rest = payload.substring(5);
  final bar = rest.indexOf('|');
  final id = bar < 0 ? rest : rest.substring(0, bar);
  if (id.isEmpty) return null;
  return (callId: id, ringToken: bar < 0 ? '' : rest.substring(bar + 1));
}

/// What a notification tap means to the session: the Accept button arrives
/// as `accept:<payload>`, a tap on the body as the payload itself.
String? encodeResponse(String? payload, String? actionId) {
  if (payload == null) return null;
  return actionId == actionAccept ? 'accept:$payload' : payload;
}

/// What to do with a data push. Pure so the rule is testable on the host.
enum CallPushAction { ring, clear, ignore }

CallPushAction callPushAction(Map<String, dynamic> data, DateTime now) {
  final kind = '${data['kind'] ?? ''}';
  if (kind == 'call_end') return CallPushAction.clear;
  if (kind != 'call') return CallPushAction.ignore;
  if ('${data['call_id'] ?? ''}'.isEmpty) return CallPushAction.ignore;
  final sent = int.tryParse('${data['sent_at'] ?? ''}');
  if (sent != null &&
      now.difference(DateTime.fromMillisecondsSinceEpoch(sent)) > callRingMaxAge) {
    return CallPushAction.ignore;
  }
  return CallPushAction.ring;
}

bool get _android => !kIsWeb && Platform.isAndroid;

Future<String> _savedLocale() async {
  try {
    final l = await storage.read(key: 'locale');
    if (l != null && appLocaleCodes.contains(l)) return l;
  } catch (_) {}
  return 'ko';
}

/// The ring itself: full screen, call category, ringtone on loop until
/// answered, declined, cleared or 45 s pass.
NotificationDetails ringDetails(AppLocalizations s) => NotificationDetails(
      android: AndroidNotificationDetails(
        callRingChannel,
        s.notifCallChannel,
        channelDescription: s.notifCallDesc,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.call,
        fullScreenIntent: true,
        visibility: NotificationVisibility.public,
        ongoing: true,
        autoCancel: false,
        timeoutAfter: callRingMaxAge.inMilliseconds,
        playSound: true,
        sound: const UriAndroidNotificationSound(
            'content://settings/system/ringtone'),
        audioAttributesUsage: AudioAttributesUsage.notificationRingtone,
        // FLAG_INSISTENT: the sound repeats until the ring is dismissed.
        additionalFlags: Int32List.fromList(const [4]),
        enableVibration: true,
        vibrationPattern: Int64List.fromList(const [0, 800, 600, 800, 600]),
        tag: callRingTag,
        actions: [
          AndroidNotificationAction(actionDecline, s.callDeclineAction,
              showsUserInterface: false, cancelNotification: true),
          AndroidNotificationAction(actionAccept, s.callAccept,
              showsUserInterface: true, cancelNotification: true),
        ],
      ),
    );

Future<void> showRing(
  FlutterLocalNotificationsPlugin plugin, {
  required String callId,
  required String ringToken,
  required String callerName,
  required String kind,
  required String locale,
}) {
  final s = stringsFor(locale);
  return plugin.show(
    id: callRingId,
    title: callerName,
    body: kind == 'video' ? s.mvIncomingVideo : s.mvIncomingVoice,
    notificationDetails: ringDetails(s),
    payload: ringPayload(callId, ringToken),
  );
}

Future<void> clearRing(FlutterLocalNotificationsPlugin plugin) =>
    plugin.cancel(id: callRingId, tag: callRingTag);

/// Initializes the plugin in whatever isolate this runs in (main, the FCM
/// background isolate, or the notification-action isolate).
Future<FlutterLocalNotificationsPlugin> _plugin({
  void Function(NotificationResponse)? onResponse,
}) async {
  final plugin = FlutterLocalNotificationsPlugin();
  await plugin.initialize(
    settings: const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher')),
    onDidReceiveNotificationResponse: onResponse,
    onDidReceiveBackgroundNotificationResponse: lunoNotificationBackground,
  );
  return plugin;
}

/// FCM handler while the app is closed or in the background (own isolate).
@pragma('vm:entry-point')
Future<void> lunoFirebaseBackground(RemoteMessage message) async {
  final action = callPushAction(message.data, DateTime.now());
  if (action == CallPushAction.ignore) return;
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  final plugin = await _plugin();
  if (action == CallPushAction.clear) {
    await clearRing(plugin);
    return;
  }
  final d = message.data;
  await showRing(
    plugin,
    callId: '${d['call_id']}',
    ringToken: '${d['ring_token'] ?? ''}',
    callerName: '${d['caller_name'] ?? 'LUNO'}',
    kind: '${d['call_kind'] ?? 'voice'}',
    locale: await _savedLocale(),
  );
}

/// Decline pressed on the ring (no UI, background isolate).
@pragma('vm:entry-point')
Future<void> lunoNotificationBackground(NotificationResponse response) async {
  if (response.actionId != actionDecline) return;
  final ring = parseRingPayload(response.payload);
  if (ring == null || ring.ringToken.isEmpty) return;
  try {
    await http
        .post(
          Uri.parse('$apiBase/api/v1/calls/${ring.callId}/ring-decline'),
          headers: {'Content-Type': 'application/json'},
          body: '{"token":"${ring.ringToken}"}',
        )
        .timeout(const Duration(seconds: 10));
  } catch (_) {}
  try {
    await clearRing(FlutterLocalNotificationsPlugin());
  } catch (_) {}
}

/// Registers the closed-app FCM handler. Call once from main().
void registerCallPushHandler() {
  if (!_android) return;
  try {
    FirebaseMessaging.onBackgroundMessage(lunoFirebaseBackground);
  } catch (_) {}
}

/// The phone-side of a live call. SessionController drives it; tests inject
/// a recording fake. Every method is best effort and never throws.
abstract class CallSystem {
  /// Keep the call alive off screen (foreground service + ongoing row).
  Future<void> startOngoing({required bool video, required String title});
  Future<void> stopOngoing();

  /// Show the app over the lock screen while a call is ringing or live.
  Future<void> setLockScreen(bool on);

  /// Screen off when the phone is at the ear (voice call on the earpiece).
  Future<void> setProximity(bool on);

  /// Remove the ring notification (the in-app call screen took over).
  Future<void> clearRing();

  /// The notification that launched the app, encoded like a tap
  /// ("accept:call:…" / "call:…"), consumed once.
  Future<String?> takeLaunchResponse();

  /// Ask once for full-screen ring permission where Android needs it.
  Future<void> ensureRingPermission();
}

class NoCallSystem implements CallSystem {
  const NoCallSystem();
  @override
  Future<void> startOngoing({required bool video, required String title}) async {}
  @override
  Future<void> stopOngoing() async {}
  @override
  Future<void> setLockScreen(bool on) async {}
  @override
  Future<void> setProximity(bool on) async {}
  @override
  Future<void> clearRing() async {}
  @override
  Future<String?> takeLaunchResponse() async => null;
  @override
  Future<void> ensureRingPermission() async {}
}

class ProdCallSystem implements CallSystem {
  ProdCallSystem({this.locale = _defaultLocale});
  static String _defaultLocale() => 'ko';
  final String Function() locale;

  static const _screen = MethodChannel('luno.call_screen');
  final _notifications = FlutterLocalNotificationsPlugin();
  bool _launchTaken = false;
  bool _ongoing = false;

  AndroidFlutterLocalNotificationsPlugin? get _androidPlugin => _android
      ? _notifications.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>()
      : null;

  @override
  Future<void> startOngoing({required bool video, required String title}) async {
    final android = _androidPlugin;
    if (android == null) return;
    try {
      final s = stringsFor(locale());
      await android.startForegroundService(
        id: callOngoingId,
        title: title.isEmpty ? s.callOngoingTitle : '${s.callOngoingTitle} · $title',
        body: s.callOngoingBody,
        notificationDetails: AndroidNotificationDetails(
          callOngoingChannel,
          s.callOngoingTitle,
          importance: Importance.low,
          priority: Priority.low,
          category: AndroidNotificationCategory.call,
          ongoing: true,
          autoCancel: false,
          playSound: false,
          enableVibration: false,
          usesChronometer: true,
          when: DateTime.now().millisecondsSinceEpoch,
          showWhen: true,
        ),
        payload: 'ongoing-call',
        foregroundServiceTypes: {
          AndroidServiceForegroundType.foregroundServiceTypeMicrophone,
          if (video) AndroidServiceForegroundType.foregroundServiceTypeCamera,
        },
      );
      _ongoing = true;
    } catch (_) {}
  }

  @override
  Future<void> stopOngoing() async {
    if (!_ongoing) return;
    _ongoing = false;
    try {
      await _androidPlugin?.stopForegroundService();
    } catch (_) {}
  }

  @override
  Future<void> setLockScreen(bool on) async {
    if (!_android) return;
    try {
      await _screen.invokeMethod('lockScreen', {'on': on});
    } catch (_) {}
  }

  @override
  Future<void> setProximity(bool on) async {
    if (!_android) return;
    try {
      await _screen.invokeMethod('proximity', {'on': on});
    } catch (_) {}
  }

  @override
  Future<void> clearRing() async {
    if (!_android) return;
    try {
      await _notifications.cancel(id: callRingId, tag: callRingTag);
    } catch (_) {}
  }

  @override
  Future<String?> takeLaunchResponse() async {
    if (!_android || _launchTaken) return null;
    _launchTaken = true;
    try {
      final details = await _notifications.getNotificationAppLaunchDetails();
      if (details == null || !details.didNotificationLaunchApp) return null;
      final r = details.notificationResponse;
      return encodeResponse(r?.payload, r?.actionId);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> ensureRingPermission() async {
    final android = _androidPlugin;
    if (android == null) return;
    try {
      if (await storage.read(key: 'ring_permission_asked') == '1') return;
      await storage.write(key: 'ring_permission_asked', value: '1');
      await android.requestFullScreenIntentPermission();
    } catch (_) {}
  }
}
