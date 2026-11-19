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
      color: const Color(0xFF020617),
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
              child: Column(
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: HarborType.title, color: Colors.white)),
                  Text(
                    context.l10n.groupCallStatus(kind == 'video' ? context.l10n.videoWord : context.l10n.voiceWord, callDurationLabel(session.groupCallSeconds), peers.length + 1),
                    style: const TextStyle(
                        fontSize: 13, color: Colors.white70),
                  ),
                  if (session.groupMediaIssue)
                    Text(context.l10n.callNoMedia,
                        style: TextStyle(
                            fontSize: HarborType.small, color: Colors.amber)),
                ],
              ),
            ),
            Expanded(
              child: GridView.count(
                crossAxisCount: groupTileColumns(width),
                padding: const EdgeInsets.all(8),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 3 / 4,
                children: [
                  _selfTile(context, session, kind),
                  for (final peer in peers) _peerTile(context, session, peer),
                ],
              ),
            ),
            if (peers.isEmpty)
              Padding(
                padding: EdgeInsets.only(bottom: 4),
                child: Text(context.l10n.mvGroupCallWaiting,
                    style:
                        TextStyle(fontSize: 13, color: Colors.white70)),
              ),
            Padding(
              padding: const EdgeInsets.only(bottom: 20, top: 4),
              child: _controlBar(context, session, kind),
            ),
          ],
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
      color: HarborLight.harbor,
      video: showVideo
          ? RTCVideoView(session.groupLocalMedia!.localRenderer!,
              objectFit:
                  RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              mirror: true)
          : null,
      muted: session.groupMuted,
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
          ? RTCVideoView(remote,
              objectFit:
                  RTCVideoViewObjectFit.RTCVideoViewObjectFitCover)
          : null,
      muted: false,
    );
  }

  Widget _tile(
      {required String name,
      required Color color,
      required Widget? video,
      required bool muted}) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(HarborRadius.card),
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(color: const Color(0xFF1E293B)),
          if (video != null) video,
          if (video == null) Center(child: IdentityTile(glyph: name, color: color, size: 56)),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              color: Colors.black54,
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Text(
                '${muted ? '🔇 ' : ''}$name',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: HarborType.small, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _controlBar(
      BuildContext context, SessionController session, String kind) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _roundButton(
          tooltip: session.groupMuted ? context.l10n.callUnmute : context.l10n.callMute,
          color: Colors.white24,
          icon: session.groupMuted ? Icons.mic_off : Icons.mic,
          onPressed: () => session.setGroupMuted(!session.groupMuted),
        ),
        if (kind == 'video') ...[
          const SizedBox(width: 12),
          _roundButton(
            tooltip: context.l10n.mvCameraToggle,
            color: Colors.white24,
            icon:
                session.groupVideoOff ? Icons.videocam_off : Icons.videocam,
            onPressed: () =>
                session.setGroupVideoOff(!session.groupVideoOff),
          ),
          const SizedBox(width: 12),
          _roundButton(
            tooltip: context.l10n.mvCameraSwitch,
            color: Colors.white24,
            icon: Icons.switch_camera,
            onPressed: () => session.switchGroupCamera(),
          ),
        ],
        const SizedBox(width: 12),
        _roundButton(
          tooltip: context.l10n.callSpeaker,
          color: Colors.white24,
          icon: session.callSpeaker ? Icons.volume_up : Icons.volume_down,
          onPressed: () => session.setGroupSpeaker(!session.callSpeaker),
        ),
        const SizedBox(width: 12),
        _roundButton(
          tooltip: context.l10n.callEnd,
          color: Colors.red,
          icon: Icons.call_end,
          onPressed: () => session.leaveGroupCall(),
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
