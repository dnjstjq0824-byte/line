// Build 16: a friend's profile, LINE style. Before, tapping a friend jumped
// straight into the chat and nobody ever saw anyone else's photo or cover.
// Full-screen: their cover photo, their profile photo, name and status
// message, then 1:1 chat / voice call / video call.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';
import '../util/app_permissions.dart';

Future<void> showFriendProfile(
    BuildContext context, Map<String, dynamic> user) async {
  final session = SessionScope.of(context, listen: false);
  if ('${user['id']}' == session.selfId) {
    context.go('/profile');
    return;
  }
  await Navigator.of(context).push(MaterialPageRoute<void>(
    fullscreenDialog: true,
    builder: (_) => FriendProfilePage(user: user),
  ));
}

class FriendProfilePage extends StatelessWidget {
  final Map<String, dynamic> user;
  const FriendProfilePage({super.key, required this.user});

  Future<void> _chat(BuildContext context, SessionController session) async {
    final id = await session.startChat(
        '${user['id']}', '${user['display_name'] ?? ''}');
    if (id == null || !context.mounted) return;
    Navigator.of(context).pop();
    context.go('/chats/$id');
  }

  Future<void> _call(
      BuildContext context, SessionController session, String kind) async {
    await withPermissions(
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
      action: () async {
        final id = await session.startChat(
            '${user['id']}', '${user['display_name'] ?? ''}');
        if (id == null) return;
        if (context.mounted) Navigator.of(context).pop();
        await session.startCallIn(id, kind);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final name = '${user['nickname'] ?? ''}'.isNotEmpty
        ? '${user['nickname']}'
        : '${user['display_name'] ?? ''}';
    final status = '${user['status_message'] ?? ''}';
    final cover = session.photoOf(user['cover_url']);
    final photo = session.photoOf(user['avatar_url']);
    final color = session.colorFromHex(
        user['avatar_color']?.toString(), const Color(0xFF4F7CFF));
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (cover != null)
            Image(
              image: cover,
              key: const Key('friend-cover'),
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _fallbackBackdrop(color),
            )
          else
            _fallbackBackdrop(color),
          // Legibility scrim for the name and buttons.
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x33000000), Color(0x00000000), Color(0xCC000000)],
                stops: [0, 0.45, 1],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                    icon: const Icon(Icons.close, color: Colors.white),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
                const Spacer(),
                IdentityTile(
                  key: const Key('friend-avatar'),
                  glyph: name,
                  color: color,
                  size: 96,
                  photo: photo,
                ),
                const SizedBox(height: 14),
                Text(name,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: HarborType.display,
                        fontWeight: FontWeight.w800)),
                if (status.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Text(status,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 14)),
                  ),
                ],
                const SizedBox(height: 28),
                const Divider(color: Colors.white24, height: 1),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 18),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _Action(
                        icon: Icons.chat_bubble_outline,
                        label: context.l10n.tabChats,
                        onTap: () => _chat(context, session),
                      ),
                      _Action(
                        icon: Icons.call_outlined,
                        label: context.l10n.callVoice,
                        onTap: () => _call(context, session, 'voice'),
                      ),
                      _Action(
                        icon: Icons.videocam_outlined,
                        label: context.l10n.callVideo,
                        onTap: () => _call(context, session, 'video'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fallbackBackdrop(Color color) => DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.85), const Color(0xFF0F172A)],
          ),
        ),
      );
}

class _Action extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  const _Action({required this.icon, required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(HarborRadius.avatar),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 26),
            const SizedBox(height: 6),
            Text(label,
                style: const TextStyle(
                    color: Colors.white, fontSize: HarborType.small)),
          ],
        ),
      ),
    );
  }
}
