// F15: full-screen group call overlay, mounted once in main.dart next to
// the 1:1 CallOverlay. One tile per seat (self + remote participants):
// live video when a remote stream is flowing, IdentityTile avatar + name
// otherwise. Grid columns follow the 11장 spec widths (2 under 700px, 3
// under 1100px, 4 above). Bottom bar mirrors the 1:1 active bar (mic,
// camera, camera-switch, speaker, red hangup); a group room never rings,
// so there is no incoming state.
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../design/v3.dart';
import '../state/session.dart';
import 'call_overlay.dart' show CallImmersive, callDurationLabel;
import '../util/app_l10n.dart';

int groupTileColumns(double width) {
  if (width < 700) return 2;
  if (width < 1100) return 3;
  return 4;
}

class GroupCallOverlay extends StatelessWidget {
  const GroupCallOverlay({super.key});

  static const _lineGreen = Color(0xFF06C755);
  static const _callRed = Color(0xFFEF4444);
  static const _stageTop = Color(0xFF15271F);
  static const _stageBottom = Color(0xFF0A1014);

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final call = session.groupCall;
    if (call == null) return const SizedBox.shrink();
    final kind = '${call['kind'] ?? 'voice'}';
    final title = '${call['title'] ?? context.l10n.groupCallWord}';
    final peers =
        List<Map<String, dynamic>>.from(call['participants'] ?? []);
    final width = MediaQuery.sizeOf(context).width;
    return CallImmersive(
      child: Material(
        color: _stageBottom,
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [_stageTop, _stageBottom],
            ),
          ),
          child: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                  child: Column(
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: HarborType.title,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.1),
                          borderRadius:
                              BorderRadius.circular(HarborRadius.card),
                        ),
                        child: Text(
                          context.l10n.groupCallStatus(
                            kind == 'video'
                                ? context.l10n.videoWord
                                : context.l10n.voiceWord,
                            callDurationLabel(session.groupCallSeconds),
                            peers.length + 1,
                          ),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF6EF5A4),
                          ),
                        ),
                      ),
                      if (session.groupMediaIssue)
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
                    ],
                  ),
                ),
                Expanded(
                  child: GridView.count(
                    crossAxisCount: groupTileColumns(width),
                    padding: const EdgeInsets.all(12),
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 3 / 4,
                    children: [
                      _selfTile(context, session, kind),
                      for (final peer in peers)
                        _peerTile(context, session, peer),
                    ],
                  ),
                ),
                if (peers.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Text(
                      context.l10n.mvGroupCallWaiting,
                      style: const TextStyle(
                          fontSize: 13, color: Colors.white70),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 6, 16, 20),
                  child: _controlBar(context, session, kind),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _selfTile(
      BuildContext context, SessionController session, String kind) {
    final showVideo = kind == 'video' &&
        !session.groupVideoOff &&
        session.groupLocalMedia?.localRenderer != null;
    final name =
        session.selfName.isEmpty ? context.l10n.mvMe : session.selfName;
    return _tile(
      name: context.l10n.groupSelfName(name),
      color: _lineGreen,
      video: showVideo
          ? RTCVideoView(
              session.groupLocalMedia!.localRenderer!,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              mirror: true,
            )
          : null,
      muted: session.groupMuted,
      isSelf: true,
    );
  }

  Widget _peerTile(BuildContext context, SessionController session,
      Map<String, dynamic> peer) {
    final id = '${peer['id']}';
    final media = session.groupPeerMedia[id];
    final name = '${peer['display_name'] ?? peer['name'] ?? id}';
    final remote = media?.remoteRenderer;
    final showVideo = media != null && media.hasRemoteStream && remote != null;
    return _tile(
      name: name,
      color: session.colorFromHex(
          '${peer['avatar_color'] ?? ''}', HarborLight.harbor),
      video: showVideo
          ? RTCVideoView(
              remote,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
            )
          : null,
      muted: false,
      isSelf: false,
    );
  }

  Widget _tile({
    required String name,
    required Color color,
    required Widget? video,
    required bool muted,
    required bool isSelf,
  }) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        border: Border.all(
          color: isSelf
              ? _lineGreen.withValues(alpha: 0.6)
              : Colors.white.withValues(alpha: 0.12),
          width: isSelf ? 1.5 : 1,
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(HarborRadius.card),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(color: Colors.white.withValues(alpha: 0.06)),
            if (video != null) video,
            if (video == null)
              Center(child: IdentityTile(glyph: name, color: color, size: 60)),
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.62),
                  borderRadius: BorderRadius.circular(8),
                ),
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (muted) ...[
                      const Icon(Icons.mic_off_rounded,
                          size: 13, color: _callRed),
                      const SizedBox(width: 4),
                    ],
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: HarborType.small,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
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

  Widget _controlBar(
      BuildContext context, SessionController session, String kind) {
    final muted = session.groupMuted;
    final videoOff = session.groupVideoOff;
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
              onPressed: () => session.setGroupMuted(!muted),
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
                onPressed: () => session.setGroupVideoOff(!videoOff),
              ),
              _roundButton(
                tooltip: context.l10n.mvCameraSwitch,
                label: context.l10n.mvCameraSwitch,
                color: Colors.white.withValues(alpha: 0.16),
                icon: Icons.cameraswitch_rounded,
                onPressed: () => session.switchGroupCamera(),
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
              onPressed: () => session.setGroupSpeaker(!speaker),
            ),
            _roundButton(
              tooltip: context.l10n.callEnd,
              label: context.l10n.callEnd,
              color: _callRed,
              icon: Icons.call_end_rounded,
              onPressed: () => session.leaveGroupCall(),
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
    required VoidCallback onPressed,
  }) {
    return SizedBox(
      width: 62,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 54,
            height: 54,
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
