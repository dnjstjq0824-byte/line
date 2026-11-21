// Route: /chats/:cid/settings — group room settings. Photo, name, notice,
// members with roles, friend invites, invite links with QR, and leave.
// Privileged-only controls hide for plain members; the server enforces all.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import 'profile.dart';
import '../util/app_l10n.dart';

class GroupSettingsPage extends StatefulWidget {
  final String conversationId;
  const GroupSettingsPage({super.key, required this.conversationId});

  @override
  State<GroupSettingsPage> createState() => _GroupSettingsPageState();
}

class _GroupSettingsPageState extends State<GroupSettingsPage> {
  final _picked = <String>{};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final session = SessionScope.of(context, listen: false);
      session.loadRoomDetail(widget.conversationId);
      session.loadRoomInvites(widget.conversationId);
    });
  }

  String _roleLabel(String role) {
    if (role == 'owner') return context.l10n.gsOwner;
    if (role == 'admin') return context.l10n.demoAdmin;
    return context.l10n.gsMembers;
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final room = session.selectedRoom;
    final members = List<dynamic>.from(room['members'] ?? []);
    final myRole = '${room['my_role'] ?? 'member'}';
    final privileged = myRole == 'owner' || myRole == 'admin';
    final isOwner = myRole == 'owner';
    final title = '${room['title'] ?? session.selectedTitle}';
    final photo = profilePhotoImage(
        session.api.baseUrl, '${room['avatar_url'] ?? ''}',
        token: session.api.token);
    final memberIds = members.map((m) => '${m['id']}').toSet();
    final invitable = session.friends
        .where((f) => !memberIds.contains('${f['id']}'))
        .toList();
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;

    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.gsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              IdentityTile(
                glyph: title,
                color: dark ? HarborDark.harbor : LunoBrand.deep,
                size: 56,
                photo: photo,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: TextStyle(color: ink, fontSize: 18)),
                    Text(context.l10n.groupMembersRole(members.length, _roleLabel(myRole)),
                        style: TextStyle(color: sub, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          if (privileged) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                OutlinedButton(
                  onPressed: () => session.updateRoomPhotoFromPicker(
                      widget.conversationId),
                  child: Text(context.l10n.gsPhotoChange),
                ),
                const SizedBox(width: 8),
                if ('${room['avatar_url'] ?? ''}'.isNotEmpty)
                  TextButton(
                    onPressed: () =>
                        session.clearRoomPhoto(widget.conversationId),
                    child: Text(context.l10n.gsPhotoRemove),
                  ),
              ],
            ),
          ],
          const SizedBox(height: 16),
          _SectionTitle(context.l10n.gsName),
          Row(
            children: [
              Expanded(child: Text(title, style: TextStyle(color: ink))),
              if (privileged)
                TextButton(
                  onPressed: () => _textDialog(context, context.l10n.gsName, title,
                      (v) => session.renameRoom(widget.conversationId, v)),
                  child: Text(context.l10n.changeWord),
                ),
            ],
          ),
          const SizedBox(height: 8),
          _SectionTitle(context.l10n.gsNotice),
          Row(
            children: [
              Expanded(
                child: Text(
                  '${room['notice'] ?? ''}'.isEmpty
                      ? context.l10n.groupNoNotice
                      : '${room['notice']}',
                  style: TextStyle(color: sub),
                ),
              ),
              if (privileged)
                TextButton(
                  onPressed: () => _textDialog(context, context.l10n.gsNotice,
                      '${room['notice'] ?? ''}',
                      (v) =>
                          session.setRoomNotice(widget.conversationId, v),
                      required: false, multiline: true),
                  child: Text(context.l10n.changeWord),
                ),
            ],
          ),
          const SizedBox(height: 16),
          _SectionTitle(context.l10n.groupMembersParen(members.length)),
          for (final m in members) _memberTile(context, session,
              m as Map<String, dynamic>, myRole, privileged, isOwner, dark),
          const SizedBox(height: 16),
          _SectionTitle(context.l10n.gsInvite),
          if (invitable.isEmpty)
            Text(context.l10n.gsInviteNone, style: TextStyle(color: sub))
          else ...[
            for (final f in invitable)
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                title: Text('${f['display_name'] ?? ''}'),
                value: _picked.contains('${f['id']}'),
                onChanged: (v) => setState(() {
                  if (v == true) {
                    _picked.add('${f['id']}');
                  } else {
                    _picked.remove('${f['id']}');
                  }
                }),
              ),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: _picked.isEmpty
                    ? null
                    : () async {
                        await session.inviteMembers(
                            widget.conversationId, _picked.toList());
                        if (mounted) setState(_picked.clear);
                      },
                child: Text(context.l10n.groupInvite),
              ),
            ),
          ],
          if (privileged) ...[
            const SizedBox(height: 16),
            _SectionTitle(context.l10n.gsLinks),
            Row(
              children: [
                Expanded(
                  child: Text(context.l10n.roomInvitesActive(session.roomInvites.length),
                      style: TextStyle(color: sub)),
                ),
                TextButton(
                  onPressed: () =>
                      session.createRoomInvite(widget.conversationId, 168),
                  child: Text(context.l10n.groupNewLink),
                ),
              ],
            ),
            for (final inv in session.roomInvites)
              _inviteTile(context, session,
                  inv as Map<String, dynamic>, widget.conversationId),
          ],
          const SizedBox(height: 24),
          OutlinedButton(
            style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
            onPressed: () => _confirm(context, context.l10n.gsLeaveConfirm, () async {
              await session.leaveChat(widget.conversationId);
              if (context.mounted) context.go('/chats');
            }),
            child: Text(context.l10n.groupLeave),
          ),
        ],
      ),
    );
  }

  Widget _memberTile(
      BuildContext context,
      SessionController session,
      Map<String, dynamic> m,
      String myRole,
      bool privileged,
      bool isOwner,
      bool dark) {
    final id = '${m['id']}';
    final role = '${m['role'] ?? 'member'}';
    final isSelf = id == session.selfId;
    final canAct = !isSelf &&
        (isOwner || (myRole == 'admin' && role == 'member'));
    final img =
        profilePhotoImage(session.api.baseUrl, '${m['avatar_url'] ?? ''}',
            token: session.api.token);
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      leading: IdentityTile(
        glyph: '${m['display_name'] ?? ''}',
        color: dark ? HarborDark.harbor : LunoBrand.deep,
        photo: img,
      ),
      title: Text('${m['display_name'] ?? ''}'),
      subtitle: Text(_roleLabel(role)),
      trailing: canAct
          ? PopupMenuButton<String>(
              onSelected: (v) {
                final cid = widget.conversationId;
                if (v == 'admin') {
                  session.setMemberRole(cid, id,
                      role == 'admin' ? 'member' : 'admin');
                } else if (v == 'transfer') {
                  _confirm(context, context.l10n.gsTransferConfirm,
                      () => session.transferRoom(cid, id));
                } else if (v == 'kick') {
                  _confirm(context, context.l10n.gsKickConfirm,
                      () => session.kickMember(cid, id));
                }
              },
              itemBuilder: (_) => [
                if (isOwner)
                  PopupMenuItem(
                    value: 'admin',
                    child:
                        Text(role == 'admin' ? context.l10n.gsRemoveAdmin : context.l10n.gsMakeAdmin),
                  ),
                if (isOwner)
                  PopupMenuItem(
                      value: 'transfer', child: Text(context.l10n.gsTransfer)),
                PopupMenuItem(value: 'kick', child: Text(context.l10n.gsKick)),
              ],
            )
          : null,
    );
  }

  Widget _inviteTile(BuildContext context, SessionController session,
      Map<String, dynamic> inv, String cid) {
    final url = '${inv['invite_url'] ?? ''}';
    return ListTile(
      dense: true,
      contentPadding: EdgeInsets.zero,
      title: Text(url,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            tooltip: 'QR',
            icon: const Icon(Icons.qr_code_2),
            onPressed: () => showModalBottomSheet<void>(
              context: context,
              builder: (_) => Padding(
                padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(context.l10n.groupInviteQr,
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 16),
                    QrImageView(data: url, size: 200),
                  ],
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: context.l10n.gsLinkCopy,
            icon: const Icon(Icons.copy),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: url));
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(context.l10n.gsLinkCopied)));
              }
            },
          ),
          IconButton(
            tooltip: context.l10n.gsLinkRevoke,
            icon: const Icon(Icons.delete_outline),
            onPressed: () =>
                session.revokeRoomInvite(cid, '${inv['token']}'),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Text(text,
        style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: dark ? LunoDark.textSecondary : LunoLight.textSecondary));
  }
}

Future<void> _textDialog(BuildContext context, String title, String initial,
    Future<void> Function(String) onSave,
    {bool required = true, bool multiline = false}) async {
  final controller = TextEditingController(text: initial);
  await showDialog<void>(
    context: context,
    builder: (dialog) => StatefulBuilder(
      builder: (dialog, setDialog) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: multiline ? 3 : 1,
          onChanged: (_) => setDialog(() {}),
          decoration:
              InputDecoration(labelText: title, isDense: true),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed:
                (required && controller.text.trim().isEmpty) ? null : () {
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

Future<void> _confirm(
    BuildContext context, String message, Future<void> Function() action) {
  return showDialog<void>(
    context: context,
    builder: (dialog) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(dialog).pop(),
            child: Text(context.l10n.mvCancel)),
        FilledButton(
          onPressed: () {
            Navigator.of(dialog).pop();
            action();
          },
          child: Text(context.l10n.confirmWord),
        ),
      ],
    ),
  );
}
