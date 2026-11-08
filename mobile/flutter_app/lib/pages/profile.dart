// Route: /profile — full-screen my profile in the reference style.
// Full-bleed cover, overlapping avatar, name, handle, status message.
// Only real data is shown: the session model has no birthday or cover
// photo, so those rows are intentionally absent.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/v3.dart';
import '../state/session.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? '내 프로필' : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? '상태 메시지 입력'
        : session.selfStatusMessage;
    return Scaffold(
      backgroundColor: dark ? HarborDark.fog : Colors.white,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  height: 300,
                  width: double.infinity,
                  color: dark ? HarborDark.surface : LunoBrand.deep,
                  child: const Center(
                    child: Icon(Icons.chat_bubble,
                        size: 120, color: Color(0x33FFFFFF)),
                  ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  child: SafeArea(
                    child: IconButton(
                      tooltip: '닫기',
                      onPressed: () => context.go('/home'),
                      icon: const Icon(Icons.close, color: Colors.white),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: -44,
                  child: Center(
                    child: Container(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(
                            color: dark ? HarborDark.fog : Colors.white,
                            width: 4),
                      ),
                      child: LineAvatar(
                        glyph: name,
                        color:
                            dark ? HarborDark.harbor : LunoBrand.deep,
                        size: 88,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 60, 24, 32),
              child: Column(
                children: [
                  Text(name,
                      style: const TextStyle(
                          fontSize: 22, fontWeight: FontWeight.w800)),
                  if (session.selfHandle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('@${session.selfHandle}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                  const SizedBox(height: 8),
                  Text(status,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge),
                  const SizedBox(height: 28),
                  OutlinedButton.icon(
                    onPressed: () => context.go('/keep'),
                    icon: const Icon(Icons.bookmark_border),
                    label: const Text('Keep 메모'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
