// Route: /profile — full-screen my profile in the reference style.
// Full-bleed cover, overlapping avatar, name, handle, status message.
// Only real data is shown: the session model has no birthday or cover
// photo, so those rows are intentionally absent.
import 'dart:convert';

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
                      child: _ProfileAvatar(name: name, dark: dark),
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
                  if (session.selfBirthday.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text('생일 ${session.selfBirthday}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                  const SizedBox(height: 28),
                  OutlinedButton.icon(
                    onPressed: () => showDialog(
                      context: context,
                      builder: (_) => const _ProfileEditDialog(),
                    ),
                    icon: const Icon(Icons.edit_outlined),
                    label: const Text('프로필 편집'),
                  ),
                  const SizedBox(height: 12),
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

class _ProfileAvatar extends StatelessWidget {
  final String name;
  final bool dark;
  const _ProfileAvatar({required this.name, required this.dark});

  @override
  Widget build(BuildContext context) {
    final img = _avatarImage(SessionScope.of(context).selfAvatarUrl);
    if (img == null) {
      return LineAvatar(
        glyph: name,
        color: dark ? HarborDark.harbor : LunoBrand.deep,
        size: 88,
      );
    }
    return CircleAvatar(backgroundImage: img, radius: 44);
  }
}

ImageProvider? _avatarImage(String url) {
  final i = url.indexOf('base64,');
  if (!url.startsWith('data:image/') || i < 0) return null;
  try {
    return MemoryImage(base64Decode(url.substring(i + 7)));
  } catch (_) {
    return null;
  }
}

class _ProfileEditDialog extends StatefulWidget {
  const _ProfileEditDialog();

  @override
  State<_ProfileEditDialog> createState() => _ProfileEditDialogState();
}

class _ProfileEditDialogState extends State<_ProfileEditDialog> {
  final name = TextEditingController();
  final status = TextEditingController();
  final birthday = TextEditingController();
  bool _filled = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_filled) return;
    _filled = true;
    final s = SessionScope.of(context, listen: false);
    name.text = s.selfName;
    status.text = s.selfStatusMessage;
    birthday.text = s.selfBirthday;
  }

  @override
  void dispose() {
    name.dispose();
    status.dispose();
    birthday.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    return AlertDialog(
      title: const Text('프로필 편집'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
              controller: name,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                  labelText: '이름 (필수)', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: status,
              decoration: const InputDecoration(
                  labelText: '상태 메시지', isDense: true)),
          const SizedBox(height: 8),
          TextField(
              controller: birthday,
              decoration: const InputDecoration(
                  labelText: '생일 (MM-DD, 비우면 지움)', isDense: true)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: session.busy
                      ? null
                      : () {
                          Navigator.of(context).pop();
                          session.updateAvatarFromPicker();
                        },
                  icon: const Icon(Icons.photo_camera_outlined, size: 18),
                  label: const Text('사진 바꾸기',
                      style: TextStyle(fontSize: 13)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: session.busy
                      ? null
                      : () {
                          Navigator.of(context).pop();
                          session.updateProfile(avatarUrl: '');
                        },
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('사진 지우기',
                      style: TextStyle(fontSize: 13)),
                ),
              ),
            ],
          ),
        ],
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('취소')),
        FilledButton(
          onPressed: name.text.trim().isEmpty
              ? null
              : () {
                  Navigator.of(context).pop();
                  session.updateProfile(
                    displayName: name.text,
                    statusMessage: status.text,
                    birthday: birthday.text,
                  );
                },
          child: const Text('저장'),
        ),
      ],
    );
  }
}
