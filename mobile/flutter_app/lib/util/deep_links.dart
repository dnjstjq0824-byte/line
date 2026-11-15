// F21: inbound deep links + shares.
//
// Android delivers VIEW intents for https://<api-host>/{invite,chats}/…
// and luno://app/… plus SEND text/images. Cold VIEW links ride the engine
// route (see router.dart); everything else funnels through the luno.links
// method channel: getInitialShare (cold SEND), onLink (warm VIEW),
// onShare (warm SEND). parseAppLink is pure and unit-tested.
import 'package:flutter/services.dart';

import '../state/session.dart';

/// A link the app knows how to open, as a go_router location.
class AppLinkTarget {
  final String route;
  const AppLinkTarget(this.route);
}

/// Maps an incoming link to an in-app route, or null when foreign.
/// [apiHost] is the API base host (links bind to whichever host serves us).
AppLinkTarget? parseAppLink(Uri uri, String apiHost) {
  final httpsOurs = uri.scheme == 'https' && uri.host == apiHost;
  final custom = uri.scheme == 'luno' && uri.host == 'app';
  if (!httpsOurs && !custom) return null;
  var path = uri.path;
  if (path.length > 1 && path.endsWith('/')) path = path.substring(0, path.length - 1);
  if (path == '/chats' || path.startsWith('/chats/')) {
    final id = path == '/chats' ? '' : path.substring('/chats/'.length);
    if (id.isEmpty) return const AppLinkTarget('/chats');
    if (!RegExp(r'^[\w-]+$').hasMatch(id)) return null;
    return AppLinkTarget('/chats/$id');
  }
  final invite = RegExp(r'^/invite/([\w-]+)$').firstMatch(path);
  if (invite != null) return AppLinkTarget('/invite/${invite.group(1)}');
  return null;
}

/// Bridges the platform channel to the router + session. Small enough to
/// drive with fakes: [go] navigates, [session] holds pending shares.
class DeepLinkHandler {
  DeepLinkHandler({required this.session, required this.go, MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('luno.links');

  final SessionController session;
  final void Function(String location) go;
  final MethodChannel _channel;
  bool _started = false;

  String get _apiHost {
    final base = session.api.baseUrl;
    if (base.isEmpty) return '';
    return Uri.tryParse(base)?.host ?? '';
  }

  Future<void> start() async {
    if (_started) return;
    _started = true;
    _channel.setMethodCallHandler(_onCall);
    Map<dynamic, dynamic>? initial;
    try {
      initial = await _channel.invokeMethod<Map<dynamic, dynamic>?>('getInitialShare');
    } catch (_) {
      initial = null;
    }
    if (initial != null) onShare(Map<String, dynamic>.from(initial));
  }

  Future<void> _onCall(MethodCall call) async {
    switch (call.method) {
      case 'onLink':
        final args = call.arguments;
        final raw = args is Map ? '${args['uri'] ?? ''}' : '';
        final uri = Uri.tryParse(raw);
        if (uri != null) onLink(uri);
      case 'onShare':
        final args = call.arguments;
        if (args is Map) onShare(Map<String, dynamic>.from(args));
    }
  }

  /// Routes a warm VIEW link; unknown links are ignored, never crashed on.
  void onLink(Uri uri) {
    final target = parseAppLink(uri, _apiHost);
    if (target != null) go(target.route);
  }

  /// Stores shared text for the next opened room; shared photos get the
  /// honest preparing notice until the image pipeline lands.
  void onShare(Map<String, dynamic> share) {
    final text = '${share['text'] ?? ''}';
    session.receiveShare(text: text, hasImages: share['hasImages'] == true);
    if (text.isNotEmpty) go('/chats');
  }

  void dispose() {
    _started = false;
    _channel.setMethodCallHandler(null);
  }
}
