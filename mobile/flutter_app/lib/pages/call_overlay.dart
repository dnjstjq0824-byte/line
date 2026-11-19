// N2-L: full-screen 1:1 call overlay (incoming + active), mounted once in
// main.dart above the router so calls survive navigation. Same spec as the
// web CallModal plus the speaker toggle: remote fills the screen, self is a
// 25% PiP, bottom bar holds mic / camera / switch / speaker / red hangup.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_permissions.dart';
import '../util/app_l10n.dart';

String callDurationLabel(int seconds) {
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '$m:${s.toString().padLeft(2, '0')}';
}

/// Hides the status and navigation bars while a call screen is mounted and
/// restores edge-to-edge when the call ends, so calls fill the whole display
/// the way LINE's do (sticky immersive: a swipe shows the bars briefly).
class CallImmersive extends StatefulWidget {
  const CallImmersive({super.key, required this.child});
  final Widget child;

  @override
  State<CallImmersive> createState() => _CallImmersiveState();
}

class _CallImmersiveState extends State<CallImmersive> {
  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox.expand(child: widget.child);
}

class CallOverlay extends StatelessWidget {
  const CallOverlay({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final call = session.activeCall;
    if (call == null) return const SizedBox.shrink();
    final kind = '${call['kind'] ?? 'voice'}';
    final state = '${call['state'] ?? 'ringing'}';
    final incoming =
        '${call['direction'] ?? ''}' == 'incoming' && state == 'ringing';
    final title = '${call['title'] ?? context.l10n.mvCall}';
    // Opaque and edge-to-edge: the remote video (or the voice backdrop) is
    // drawn under the system bars; only the labels and buttons respect the
    // safe area.
    return CallImmersive(
      child: Material(
        color: Colors.black,
        child: Stack(
          children: [
            if (kind == 'video' && !incoming)
              Positioned.fill(child: _remoteView(session))
            else
              Positioned.fill(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xFF1E293B), Color(0xFF020617)],
                    ),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 44,
                          backgroundColor: HarborLight.harbor,
                          child: Text(
                            title.isEmpty ? '?' : title.characters.first,
                            style: const TextStyle(
                                fontSize: 36, color: Colors.white),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(title,
                            style: const TextStyle(
                                fontSize: 20, color: Colors.white)),
                        const SizedBox(height: 4),
                        Text(
                          state == 'connected'
                              ? callDurationLabel(session.callSeconds)
                              : (incoming
                                  ? context.l10n.callIncoming
                                  : context.l10n.mvCalling),
                          style: const TextStyle(
                              fontSize: 14, color: Colors.white70),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            Positioned.fill(
              child: SafeArea(
                child: Stack(
                  children: [
                    if (kind == 'video' && !incoming)
                      Positioned(
                        right: 12,
                        bottom: 96,
                        child: SizedBox(
                          width: MediaQuery.of(context).size.width * 0.25,
                          child: AspectRatio(
                            aspectRatio: 3 / 4,
                            child: ClipRRect(
                              borderRadius:
                                  BorderRadius.circular(HarborRadius.avatar),
                              child: _localView(session),
                            ),
                          ),
                        ),
                      ),
                    if (kind == 'video' && !incoming)
                      Positioned(
                        top: 8,
                        left: 0,
                        right: 0,
                        child: Column(
                          children: [
                            Text(title,
                                style: const TextStyle(
                                    fontSize: HarborType.title,
                                    color: Colors.white,
                                    shadows: [
                                      Shadow(
                                          blurRadius: 4, color: Colors.black54),
                                    ])),
                            Text(
                              state == 'connected'
                                  ? callDurationLabel(session.callSeconds)
                                  : context.l10n.mvCalling,
                              style: const TextStyle(
                                  fontSize: 13, color: Colors.white70),
                            ),
                            if (session.callMediaIssue)
                              Text(context.l10n.callNoMedia,
                                  style: TextStyle(
                                      fontSize: HarborType.small,
                                      color: Colors.amber)),
                          ],
                        ),
                      ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 20,
                      child: incoming
                          ? _incomingBar(context, session, kind)
                          : _activeBar(context, session, kind),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _remoteView(SessionController session) {
    final renderer = session.callMedia?.remoteRenderer;
    if (renderer == null) {
      return Container(color: const Color(0xFF0F172A));
    }
    return RTCVideoView(renderer,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover);
  }

  Widget _localView(SessionController session) {
    final renderer = session.callMedia?.localRenderer;
    if (renderer == null) {
      return Container(color: const Color(0xFF334155));
    }
    return RTCVideoView(renderer,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover);
  }

  Widget _incomingBar(
      BuildContext context, SessionController session, String kind) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _roundButton(
          tooltip: context.l10n.apprReject,
          color: Colors.red,
          icon: Icons.call_end,
          onPressed: () => session.declineCall(),
        ),
        _roundButton(
          tooltip: context.l10n.callAccept,
          color: Colors.green,
          icon: Icons.call,
          onPressed: () => withPermissions(
            context,
            permissions: [
              (
                Permission.microphone,
                context.l10n.permMicTitle,
                context.l10n.permMicUseCall
              ),
              if (kind == 'video')
                (
                  Permission.camera,
                  context.l10n.permCamTitle,
                  context.l10n.permCamUseVideo
                ),
            ],
            action: () => session.acceptCall(),
          ),
        ),
      ],
    );
  }

  Widget _activeBar(
      BuildContext context, SessionController session, String kind) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _roundButton(
          tooltip: session.callMuted
              ? context.l10n.callUnmute
              : context.l10n.callMute,
          color: session.callMuted ? Colors.white24 : Colors.white24,
          icon: session.callMuted ? Icons.mic_off : Icons.mic,
          onPressed: () => session.setCallMuted(!session.callMuted),
        ),
        if (kind == 'video') ...[
          const SizedBox(width: 12),
          _roundButton(
            tooltip: context.l10n.mvCameraToggle,
            color: Colors.white24,
            icon: session.callVideoOff ? Icons.videocam_off : Icons.videocam,
            onPressed: () => session.setCallVideoOff(!session.callVideoOff),
          ),
          const SizedBox(width: 12),
          _roundButton(
            tooltip: context.l10n.mvCameraSwitch,
            color: Colors.white24,
            icon: Icons.switch_camera,
            onPressed: () => session.switchCallCamera(),
          ),
        ],
        const SizedBox(width: 12),
        _roundButton(
          tooltip: context.l10n.callSpeaker,
          color: Colors.white24,
          icon: session.callSpeaker ? Icons.volume_up : Icons.volume_down,
          onPressed: () => session.setCallSpeaker(!session.callSpeaker),
        ),
        const SizedBox(width: 12),
        _roundButton(
          tooltip: context.l10n.callEnd,
          color: Colors.red,
          icon: Icons.call_end,
          onPressed: () => session.endCall(),
        ),
      ],
    );
  }

  Widget _roundButton(
      {required String tooltip,
      required Color color,
      required IconData icon,
      required VoidCallback onPressed}) {
    return SizedBox(
      width: 56,
      height: 56,
      child: Material(
        color: color,
        shape: const CircleBorder(),
        child: IconButton(
          tooltip: tooltip,
          icon: Icon(icon, color: Colors.white),
          onPressed: onPressed,
        ),
      ),
    );
  }
}
