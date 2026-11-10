// Route: /profile — my profile in the LUNO style (item 12).
// Cover + avatar with camera shortcuts, then honest rows: every row either
// edits a real server field or opens a working sheet. No phone row: the user
// model carries no verified phone number, so there is nothing true to show.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';

ImageProvider? dataUrlImage(String url) {
  final i = url.indexOf('base64,');
  if (!url.startsWith('data:image/') || i < 0) return null;
  try {
    return MemoryImage(base64Decode(url.substring(i + 7)));
  } catch (_) {
    return null;
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? '내 프로필' : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? '설정 안 함'
        : session.selfStatusMessage;
    final cover = dataUrlImage(session.selfCoverUrl);
    final searchable =
        session.myPrefs['searchable_by_id'] as bool? ?? true;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    return Scaffold(
      backgroundColor: dark ? HarborDark.fog : Colors.white,
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  children: [
                    _CircleButton(
                        icon: Icons.arrow_back,
                        tooltip: '뒤로',
                        onTap: () => context.go('/home')),
                    const Expanded(
                      child: Text('프로필',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 17, fontWeight: FontWeight.w700)),
                    ),
                    _CircleButton(
                        icon: Icons.close,
                        tooltip: '닫기',
                        onTap: () => context.go('/home')),
                  ],
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Container(
                  height: 200,
                  width: double.infinity,
                  margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(LunoRadius.md),
                    color: dark ? HarborDark.surface : LunoLight.primarySoft,
                    image: cover == null
                        ? null
                        : DecorationImage(image: cover, fit: BoxFit.cover),
                  ),
                  child: cover == null
                      ? const Center(
                          child: Icon(Icons.chat_bubble,
                              size: 72, color: Color(0x332563EB)),
                        )
                      : null,
                ),
                Positioned(
                  right: 28,
                  bottom: 12,
                  child: _CameraBadge(
                      onTap: () => _photoSheet(context, cover: true)),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: -40,
                  child: Center(
                    child: Stack(
                      clipBehavior: Clip.none,
                      children: [
                        Container(
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: dark ? HarborDark.fog : Colors.white,
                                width: 4),
                          ),
                          child: _ProfileAvatar(name: name, dark: dark),
                        ),
                        Positioned(
                          right: -2,
                          bottom: -2,
                          child: _CameraBadge(
                              small: true,
                              onTap: () =>
                                  _photoSheet(context, cover: false)),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 56, 24, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _Row(
                    label: '이름',
                    value: name,
                    ink: ink,
                    onTap: () => _textDialog(context,
                        title: '이름',
                        initial: session.selfName,
                        required: true,
                        onSave: (v) =>
                            session.updateProfile(displayName: v)),
                  ),
                  _Row(
                    label: '상태 메시지',
                    value: status,
                    dimmed: session.selfStatusMessage.isEmpty,
                    ink: ink,
                    sub: sub,
                    onTap: () => _textDialog(context,
                        title: '상태 메시지',
                        initial: session.selfStatusMessage,
                        onSave: (v) =>
                            session.updateProfile(statusMessage: v)),
                  ),
                  if (session.selfHandle.isNotEmpty)
                    _Row(
                      label: '내 QR 코드',
                      value: '',
                      ink: ink,
                      onTap: () => _qrSheet(context),
                    ),
                  const Divider(height: 32),
                  _Row(
                    label: 'LUNO ID',
                    value: session.selfHandle.isEmpty
                        ? '미설정'
                        : session.selfHandle,
                    ink: ink,
                    trailing: session.selfHandle.isEmpty
                        ? null
                        : OutlinedButton(
                            onPressed: () async {
                              await Clipboard.setData(ClipboardData(
                                  text: session.selfHandle));
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                      content: Text('LUNO ID를 복사했습니다.')),
                                );
                              }
                            },
                            child: const Text('복사'),
                          ),
                  ),
                  _ToggleRow(
                    label: 'ID로 친구 추가 허용',
                    description: '다른 사람이 내 ID를 검색하여 친구로 추가할 수 있습니다.',
                    value: searchable,
                    enabled: session.prefsLoaded,
                    ink: ink,
                    sub: sub,
                    onChanged: session.setSearchableById,
                  ),
                  const Divider(height: 32),
                  _Row(
                    label: '생일',
                    value: session.selfBirthday.isEmpty
                        ? '설정 안 함'
                        : session.selfBirthday,
                    dimmed: session.selfBirthday.isEmpty,
                    ink: ink,
                    sub: sub,
                    onTap: () => _textDialog(context,
                        title: '생일 (MM-DD, 비우면 지움)',
                        initial: session.selfBirthday,
                        onSave: (v) =>
                            session.updateProfile(birthday: v)),
                  ),
                  _Row(
                    label: '프로필 사진 및 배경 설정',
                    value: '프로필 사진과 배경을 설정할 수 있습니다.',
                    small: true,
                    ink: ink,
                    sub: sub,
                    onTap: () => _photoSheet(context, cover: false),
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

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;
  const _CircleButton(
      {required this.icon, required this.tooltip, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: dark ? HarborDark.surface : const Color(0xFFF1F5F9),
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: tooltip,
        onPressed: onTap,
        icon: Icon(icon,
            size: 20,
            color: dark ? LunoDark.textPrimary : LunoLight.textPrimary),
      ),
    );
  }
}

class _CameraBadge extends StatelessWidget {
  final VoidCallback onTap;
  final bool small;
  const _CameraBadge({required this.onTap, this.small = false});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFF0F172A),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: EdgeInsets.all(small ? 6 : 8),
          child: Icon(Icons.photo_camera,
              size: small ? 14 : 18, color: Colors.white),
        ),
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
    final img = dataUrlImage(SessionScope.of(context).selfAvatarUrl);
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

class _Row extends StatelessWidget {
  final String label;
  final String value;
  final bool dimmed;
  final bool small;
  final Color ink;
  final Color? sub;
  final Widget? trailing;
  final VoidCallback? onTap;
  const _Row({
    required this.label,
    required this.value,
    required this.ink,
    this.sub,
    this.dimmed = false,
    this.small = false,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: value.isEmpty
                  ? Text(label,
                      style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w600,
                          color: ink))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(label,
                            style: TextStyle(
                                fontSize: 13,
                                color: sub ?? Colors.grey)),
                        const SizedBox(height: 4),
                        Text(value,
                            style: TextStyle(
                              fontSize: small ? 14 : 17,
                              fontWeight: small
                                  ? FontWeight.w400
                                  : FontWeight.w600,
                              color:
                                  dimmed ? (sub ?? Colors.grey) : ink,
                            )),
                      ],
                    ),
            ),
            trailing ??
                (onTap == null
                    ? const SizedBox.shrink()
                    : Icon(Icons.chevron_right,
                        color: sub ?? Colors.grey)),
          ],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final String label;
  final String description;
  final bool value;
  final bool enabled;
  final Color ink;
  final Color sub;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({
    required this.label,
    required this.description,
    required this.value,
    required this.enabled,
    required this.ink,
    required this.sub,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: ink)),
                const SizedBox(height: 4),
                Text(description,
                    style: TextStyle(fontSize: 13, color: sub)),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: enabled ? onChanged : null,
            activeThumbColor:
                dark ? LunoDark.primary : LunoLight.primary,
          ),
        ],
      ),
    );
  }
}

Future<void> _textDialog(
  BuildContext context, {
  required String title,
  required String initial,
  bool required = false,
  required ValueChanged<String> onSave,
}) async {
  final controller = TextEditingController(text: initial);
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          onChanged: (_) => setDialog(() {}),
          decoration: InputDecoration(
              labelText: title, isDense: true),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: const Text('취소')),
          FilledButton(
            onPressed: (required && controller.text.trim().isEmpty)
                ? null
                : () {
                    Navigator.of(dialog).pop();
                    onSave(controller.text);
                  },
            child: const Text('저장'),
          ),
        ],
      ),
    ),
  );
  controller.dispose();
}

Future<void> _qrSheet(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  final payload = 'LUNO-FRIEND:${session.selfHandle}';
  await showModalBottomSheet<void>(
    context: context,
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('내 QR 코드',
              style:
                  TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('@${session.selfHandle}',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          QrImageView(data: payload, size: 200),
          const SizedBox(height: 8),
          const Text('카메라로 스캔하면 친구로 추가할 수 있습니다.',
              style: TextStyle(fontSize: 12, color: Colors.grey)),
        ],
      ),
    ),
  );
}

Future<void> _photoSheet(BuildContext context, {required bool cover}) async {
  final session = SessionScope.of(context, listen: false);
  Future<void> pick(ImageSource source) async {
    Navigator.of(context).pop();
    if (cover) {
      await session.updateCoverFromPicker(source: source);
    } else {
      await session.updateAvatarFromPicker(source: source);
    }
  }

  Future<void> remove() async {
    Navigator.of(context).pop();
    if (cover) {
      await session.updateProfile(coverUrl: '');
    } else {
      await session.updateProfile(avatarUrl: '');
    }
  }

  await showModalBottomSheet<void>(
    context: context,
    builder: (_) => Padding(
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(cover ? '커버 사진' : '프로필 사진',
              style: const TextStyle(
                  fontSize: 13, color: Colors.grey)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('카메라'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => pick(ImageSource.camera),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('사진 선택'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => pick(ImageSource.gallery),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(cover ? '커버 사진 삭제' : '프로필 사진 삭제',
                style: const TextStyle(color: LunoStatus.busy)),
            onTap: remove,
          ),
        ],
      ),
    ),
  );
}
