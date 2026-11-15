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
import '../util/app_l10n.dart';

// F5: avatar/cover arrive as an R2 serving path (/api/v1/users/...),
// an absolute URL, or a legacy inline data: URL.
ImageProvider? profilePhotoImage(String baseUrl, String url) {
  if (url.startsWith('data:image/')) {
    final i = url.indexOf('base64,');
    if (i < 0) return null;
    try {
      return MemoryImage(base64Decode(url.substring(i + 7)));
    } catch (_) {
      return null;
    }
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return NetworkImage(url);
  }
  if (url.startsWith('/')) return NetworkImage('$baseUrl$url');
  return null;
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? context.l10n.myProfile : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? context.l10n.profileUnset
        : session.selfStatusMessage;
    final cover =
        profilePhotoImage(session.api.baseUrl, session.selfCoverUrl);
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
                        tooltip: context.l10n.backWord,
                        onTap: () => context.go('/home')),
                    Expanded(
                      child: Text(context.l10n.profileTitle,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: HarborType.title, fontWeight: FontWeight.w700)),
                    ),
                    _CircleButton(
                        icon: Icons.close,
                        tooltip: context.l10n.mvRecoverCancel,
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
                    label: context.l10n.profileName,
                    value: name,
                    ink: ink,
                    onTap: () => _textDialog(context,
                        title: context.l10n.profileName,
                        initial: session.selfName,
                        required: true,
                        onSave: (v) =>
                            session.updateProfile(displayName: v)),
                  ),
                  _Row(
                    label: context.l10n.profileStatus,
                    value: status,
                    dimmed: session.selfStatusMessage.isEmpty,
                    ink: ink,
                    sub: sub,
                    onTap: () => _textDialog(context,
                        title: context.l10n.profileStatus,
                        initial: session.selfStatusMessage,
                        onSave: (v) =>
                            session.updateProfile(statusMessage: v)),
                  ),
                  if (session.selfHandle.isNotEmpty)
                    _Row(
                      label: context.l10n.profileMyQr,
                      value: '',
                      ink: ink,
                      onTap: () => _qrSheet(context),
                    ),
                  const Divider(height: 32),
                  _Row(
                    label: 'LUNO ID',
                    value: session.selfHandle.isEmpty
                        ? context.l10n.profileUnsetShort
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
                                  SnackBar(
                                      content: Text(context.l10n.profileIdCopied)),
                                );
                              }
                            },
                            child: Text(context.l10n.gsLinkCopy),
                          ),
                  ),
                  _ToggleRow(
                    label: context.l10n.privacyIdAdd,
                    description: context.l10n.privacyIdAddDesc,
                    value: searchable,
                    enabled: session.prefsLoaded,
                    ink: ink,
                    sub: sub,
                    onChanged: session.setSearchableById,
                  ),
                  const Divider(height: 32),
                  _Row(
                    label: context.l10n.profileBirthday,
                    value: session.selfBirthday.isEmpty
                        ? context.l10n.profileUnset
                        : session.selfBirthday,
                    dimmed: session.selfBirthday.isEmpty,
                    ink: ink,
                    sub: sub,
                    onTap: () => _textDialog(context,
                        title: context.l10n.profileBirthdayHint,
                        initial: session.selfBirthday,
                        onSave: (v) =>
                            session.updateProfile(birthday: v)),
                  ),
                  _Row(
                    label: context.l10n.profilePhotoSetup,
                    value: context.l10n.profilePhotoSetupDesc,
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
    final session = SessionScope.of(context);
    final img = profilePhotoImage(session.api.baseUrl, session.selfAvatarUrl);
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
                          fontSize: HarborType.title,
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
                        fontSize: HarborType.title,
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
  // No synchronous dispose: the pop transition still touches this while
  // the session notify rebuilds. Unmount unregisters; GC collects.
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
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed: (required && controller.text.trim().isEmpty)
                ? null
                : () {
                    Navigator.of(dialog).pop();
                    onSave(controller.text);
                  },
            child: Text(context.l10n.mvSave),
          ),
        ],
      ),
    ),
  );
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
          Text(context.l10n.profileMyQr,
              style:
                  TextStyle(fontSize: HarborType.title, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          Text('@${session.selfHandle}',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 16),
          QrImageView(data: payload, size: 200),
          const SizedBox(height: 8),
          Text(context.l10n.profileQrHint,
              style: TextStyle(fontSize: HarborType.small, color: Colors.grey)),
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
          Text(cover ? context.l10n.profileCover : context.l10n.profilePhoto,
              style: const TextStyle(
                  fontSize: 13, color: Colors.grey)),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.l10n.cameraWord),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => pick(ImageSource.camera),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.l10n.profilePickPhoto),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => pick(ImageSource.gallery),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(cover ? context.l10n.profileDeleteCover : context.l10n.profileDeletePhoto,
                style: const TextStyle(color: LunoStatus.busy)),
            onTap: remove,
          ),
        ],
      ),
    ),
  );
}
