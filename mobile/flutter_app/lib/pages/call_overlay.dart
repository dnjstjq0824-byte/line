// N2-L: full-screen 1:1 call overlay (incoming + active), mounted once in
// main.dart above the router so calls survive navigation. Same spec as the
// web CallModal plus the speaker toggle: remote fills the screen, self is a
// 25% PiP, bottom bar holds mic / camera / switch / speaker / red hangup.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/v3.dart';
import '../router.dart' show rootNavigatorKey;
import '../state/session.dart';
import '../util/app_permissions.dart';
import '../util/app_l10n.dart';
import '../util/call_tones.dart';

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

/// Keeps [CallTonePlayer] in step with the call: ringback for the caller,
/// ringtone + vibration for the callee, silence once connected. Unmounting
/// (the call ended and the overlay collapsed) always stops the sound.
class CallToneDriver extends StatefulWidget {
  const CallToneDriver({super.key, required this.mode});
  final CallToneMode mode;

  @override
  State<CallToneDriver> createState() => _CallToneDriverState();
}

class _CallToneDriverState extends State<CallToneDriver> {
  @override
  void initState() {
    super.initState();
    CallTonePlayer.instance.play(widget.mode);
  }

  @override
  void didUpdateWidget(CallToneDriver old) {
    super.didUpdateWidget(old);
    if (old.mode != widget.mode) CallTonePlayer.instance.play(widget.mode);
  }

  @override
  void dispose() {
    CallTonePlayer.instance.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class CallOverlay extends StatelessWidget {
  const CallOverlay({super.key});

  static const _lineGreen = Color(0xFF06C755);
  static const _callRed = Color(0xFFEF4444);
  static const _stageTop = Color(0xFF15271F);
  static const _stageBottom = Color(0xFF0A1014);

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
    final statusText = state == 'connected'
        ? callDurationLabel(session.callSeconds)
        : (incoming ? context.l10n.callIncoming : context.l10n.mvCalling);

    return CallImmersive(
      child: Material(
        color: _stageBottom,
        child: Stack(
          children: [
            CallToneDriver(mode: callToneMode(call)),
            if (kind == 'video' && !incoming)
              Positioned.fill(child: _remoteView(session))
            else
              Positioned.fill(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [_stageTop, _stageBottom],
                    ),
                  ),
                  child: Center(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 84),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(14),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _lineGreen.withValues(alpha: 0.14),
                              border: Border.all(
                                color: _lineGreen.withValues(
                                    alpha: state == 'ringing' ? 0.5 : 0.24),
                                width: 2,
                              ),
                            ),
                            child: IdentityTile(
                              glyph: title,
                              color: _lineGreen,
                              size: 96,
                            ),
                          ),
                          const SizedBox(height: 18),
                          Text(
                            title,
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 14, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.12),
                              borderRadius:
                                  BorderRadius.circular(HarborRadius.card),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  kind == 'video'
                                      ? Icons.videocam_rounded
                                      : Icons.call_rounded,
                                  size: 16,
                                  color: state == 'connected'
                                      ? const Color(0xFF6EF5A4)
                                      : Colors.white70,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  statusText,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: state == 'connected'
                                        ? const Color(0xFF6EF5A4)
                                        : Colors.white,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (session.callMediaIssue)
                            Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Text(
                                context.l10n.callNoMedia,
                                style: const TextStyle(
                                  fontSize: HarborType.small,
                                  color: Colors.amber,
                                ),
                              ),
                            ),
                          if (session.callError.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                session.callError,
                                key: const Key('call-error'),
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: HarborType.small,
                                  color: Colors.amber,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            // Top gradient scrim for video call legibility
            if (kind == 'video' && !incoming)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: 140,
                child: IgnorePointer(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.68),
                          Colors.transparent,
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            // Bottom gradient scrim behind controls
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              height: 168,
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.72),
                        Colors.transparent,
                      ],
                    ),
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
                        right: 14,
                        bottom: 118,
                        child: Container(
                          width: MediaQuery.of(context).size.width * 0.25,
                          decoration: BoxDecoration(
                            borderRadius:
                                BorderRadius.circular(HarborRadius.avatar),
                            border: Border.all(
                                color: Colors.white.withValues(alpha: 0.3),
                                width: 2),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.45),
                                blurRadius: 16,
                                offset: const Offset(0, 6),
                              ),
                            ],
                          ),
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
                        top: 12,
                        left: 16,
                        right: 16,
                        child: Column(
                          children: [
                            Text(
                              title,
                              style: const TextStyle(
                                fontSize: HarborType.title,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                                shadows: [
                                  Shadow(
                                      blurRadius: 6, color: Colors.black54),
                                ],
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.4),
                                borderRadius:
                                    BorderRadius.circular(HarborRadius.card),
                              ),
                              child: Text(
                                state == 'connected'
                                    ? callDurationLabel(session.callSeconds)
                                    : context.l10n.mvCalling,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF6EF5A4),
                                ),
                              ),
                            ),
                            if (session.callMediaIssue)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  context.l10n.callNoMedia,
                                  style: const TextStyle(
                                    fontSize: HarborType.small,
                                    color: Colors.amber,
                                  ),
                                ),
                              ),
                            if (session.callError.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  session.callError,
                                  key: const Key('call-error'),
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: HarborType.small,
                                    color: Colors.amber,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    Positioned(
                      left: 16,
                      right: 16,
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
      return Container(color: _stageBottom);
    }
    return RTCVideoView(renderer,
        objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover);
  }

  Widget _localView(SessionController session) {
    final renderer = session.callMedia?.localRenderer;
    if (renderer == null) {
      return Container(color: const Color(0xFF1F2933));
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
          label: context.l10n.apprReject,
          color: _callRed,
          icon: Icons.call_end_rounded,
          size: 64,
          onPressed: () => session.declineCall(),
        ),
        _roundButton(
          tooltip: context.l10n.callAccept,
          label: context.l10n.callAccept,
          color: _lineGreen,
          icon: kind == 'video' ? Icons.videocam_rounded : Icons.call_rounded,
          size: 64,
          // The overlay sits above the router: a permission rationale dialog
          // needs a context under the Navigator, or the gate fails silently
          // ("pressed accept, nothing happened").
          onPressed: () => withPermissions(
            rootNavigatorKey.currentContext ?? context,
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
    final muted = session.callMuted;
    final videoOff = session.callVideoOff;
    final speaker = session.callSpeaker;
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFF11181C).withValues(alpha: 0.78),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          runSpacing: 8,
          children: [
            _roundButton(
              tooltip: muted ? context.l10n.callUnmute : context.l10n.callMute,
              label: muted ? context.l10n.callUnmute : context.l10n.callMute,
              color: muted ? Colors.white : Colors.white.withValues(alpha: 0.16),
              iconColor: muted ? const Color(0xFF111827) : Colors.white,
              icon: muted ? Icons.mic_off_rounded : Icons.mic_rounded,
              onPressed: () => session.setCallMuted(!muted),
            ),
            if (kind == 'video') ...[
              _roundButton(
                tooltip: context.l10n.mvCameraToggle,
                label: context.l10n.mvCameraToggle,
                color: videoOff
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.16),
                iconColor: videoOff ? const Color(0xFF111827) : Colors.white,
                icon: videoOff
                    ? Icons.videocam_off_rounded
                    : Icons.videocam_rounded,
                onPressed: () => session.setCallVideoOff(!videoOff),
              ),
              _roundButton(
                tooltip: context.l10n.mvCameraSwitch,
                label: context.l10n.mvCameraSwitch,
                color: Colors.white.withValues(alpha: 0.16),
                icon: Icons.cameraswitch_rounded,
                onPressed: () => session.switchCallCamera(),
              ),
            ],
            _roundButton(
              tooltip: context.l10n.callSpeaker,
              label: context.l10n.callSpeaker,
              color: speaker
                  ? _lineGreen
                  : Colors.white.withValues(alpha: 0.16),
              icon: speaker
                  ? Icons.volume_up_rounded
                  : Icons.volume_down_rounded,
              onPressed: () => session.setCallSpeaker(!speaker),
            ),
            _roundButton(
              tooltip: context.l10n.callEnd,
              label: context.l10n.callEnd,
              color: _callRed,
              icon: Icons.call_end_rounded,
              onPressed: () => session.endCall(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _roundButton({
    required String tooltip,
    required String label,
    required Color color,
    Color iconColor = Colors.white,
    required IconData icon,
    double size = 54,
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: size + 8,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: size,
            height: size,
            child: Material(
              color: color,
              shape: const CircleBorder(),
              child: IconButton(
                tooltip: tooltip,
                icon: Icon(icon, color: iconColor, size: 24),
                onPressed: onPressed,
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.84),
            ),
          ),
        ],
      ),
    );
  }
}
