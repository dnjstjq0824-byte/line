// Route: /home — reference-parity home. Profile header (opens /profile),
// search, service shortcuts, official accounts, collapsible friends.
// Stories and official channels live on their own routes (/stories,
// /channels) and are only linked here. Friend rows still open chats.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  bool friendsOpen = true;

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? context.l10n.myProfile : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? context.l10n.homeStatusHint
        : session.selfStatusMessage;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          // One header row like the other tabs: title left, shortcuts right.
          Masthead(
            title: context.l10n.mvHome,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Keep',
                  icon: const Icon(Icons.bookmark_border),
                  onPressed: () => context.go('/keep'),
                ),
                IconButton(
                  tooltip: context.l10n.homeQrApprove,
                  icon: const Icon(Icons.qr_code_scanner),
                  onPressed: () => showDialog(
                    context: context,
                    builder: (dialog) => _QrApproveDialog(
                      onScan: () {
                        Navigator.of(dialog).pop();
                        context.go('/qr/scan');
                      },
                    ),
                  ),
                ),
                IconButton(
                  tooltip: context.l10n.settingsTitle,
                  icon: const Icon(Icons.settings_outlined),
                  onPressed: () => context.go('/settings'),
                ),
              ],
            ),
          ),
          // My profile: avatar first, like a friend row but larger.
          InkWell(
            onTap: () => context.go('/profile'),
            borderRadius: BorderRadius.circular(HarborRadius.control),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                children: [
                  LineAvatar(
                    glyph: name,
                    color: dark ? HarborDark.harbor : HarborLight.harbor,
                    size: 56,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text(status,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  Icon(Icons.chevron_right,
                      color: dark ? HarborDark.drift : HarborLight.drift),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () => context.go('/search'),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                decoration: BoxDecoration(
                  color: dark ? HarborDark.chart : const Color(0xFFF1F3F4),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.search, size: 20),
                    const SizedBox(width: 8),
                    Text(context.l10n.mvSearch,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(context.l10n.serviceWord, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          // F25: wrap so 200% text moves to a second line instead
          // of overflowing on a 360px phone.
          Wrap(
            alignment: WrapAlignment.spaceAround,
            spacing: 4,
            runSpacing: 8,
            children: [
              _ServiceButton(
                  icon: Icons.auto_stories_outlined,
                  label: context.l10n.storyWord,
                  route: '/stories'),
              _ServiceButton(
                  icon: Icons.verified_outlined,
                  label: context.l10n.officialChannels,
                  route: '/channels'),
              _ServiceButton(
                  icon: Icons.bookmark_border,
                  label: 'Keep',
                  route: '/keep'),
              _ServiceButton(
                  icon: Icons.account_balance_wallet_outlined,
                  label: context.l10n.mvWallet,
                  route: '/wallet'),
            ],
          ),
          const SizedBox(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Container(
              width: 44,
              height: 44,
              decoration: const BoxDecoration(
                  color: LunoBrand.primary, shape: BoxShape.circle),
              child:
                  const Icon(Icons.verified_outlined, color: Colors.white),
            ),
            title: Text(context.l10n.mvOfficialAccount,
                style: TextStyle(fontWeight: FontWeight.w600)),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${session.officialAccounts.length}',
                    style: Theme.of(context).textTheme.bodySmall),
                const Icon(Icons.chevron_right, size: 20),
              ],
            ),
            onTap: () => context.go('/channels'),
          ),
          if (session.friends.any((u) => u['birthday_today'] == true))
            Card(
              color: dark ? HarborDark.surface : Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(
                    color: dark ? HarborDark.channel : HarborLight.channel),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.cake_outlined, size: 20),
                        SizedBox(width: 8),
                        Text(context.l10n.birthdayFriends,
                            style: TextStyle(
                                fontSize: 14, fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      session.friends
                          .where((u) => u['birthday_today'] == true)
                          .map((u) => '${u['display_name']}')
                          .join(', '),
                      style: const TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              ),
            ),
          InkWell(
            onTap: () => setState(() => friendsOpen = !friendsOpen),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text(context.l10n.homeFriendsCount(session.friends.length),
                        style: Theme.of(context).textTheme.titleMedium),
                  ),
                  Icon(friendsOpen
                      ? Icons.keyboard_arrow_up
                      : Icons.keyboard_arrow_down),
                ],
              ),
            ),
          ),
          if (friendsOpen)
            for (final u in session.friends)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: LineAvatar(
                  glyph: '${u['display_name'] ?? 'U'}',
                  color: session.colorFromHex(
                      u['peer_color']?.toString(),
                      dark ? HarborDark.harbor : HarborLight.harbor),
                  size: 44,
                ),
                title: Text('${u['is_favorite'] == true ? '★ ' : ''}${u['display_name']}${u['kind'] == 'bot' ? ' [BOT]' : ''}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                    '${u['status_message'] ?? '@${u['handle'] ?? ''}'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall),
                trailing: PopupMenuButton<String>(
                  tooltip: context.l10n.homeFriendsManage,
                  onSelected: (v) {
                    if (v == 'fav') {
                      session.toggleFavoriteFriend(
                          '${u['id']}', u['is_favorite'] != true);
                    } else if (v == 'block') {
                      session.toggleBlockFriend(
                          '${u['id']}', u['is_blocked'] != true);
                    } else if (v == 'report') {
                      reportUserSheet(context, session, '${u['id']}',
                          '${u['display_name'] ?? ''}');
                    }
                  },
                  itemBuilder: (_) => [
                    PopupMenuItem(
                        value: 'fav',
                        child: Text(u['is_favorite'] == true
                            ? context.l10n.homeUnfavorite
                            : context.l10n.mvFavTitle)),
                    PopupMenuItem(
                        value: 'block',
                        child: Text(u['is_blocked'] == true
                            ? context.l10n.mvUnblock
                            : context.l10n.homeBlock)),
                    PopupMenuItem(
                        value: 'report', child: Text(context.l10n.mvReportUser)),
                  ],
                ),
                onTap: () async {
                  final id =
                      await session.startChat(u['id'], u['display_name']);
                  if (id != null && context.mounted) {
                    context.go('/chats/$id');
                  }
                },
              ),
        ],
      ),
    );
  }
}

class _ServiceButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final String route;
  const _ServiceButton(
      {required this.icon, required this.label, required this.route});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go(route),
      borderRadius: BorderRadius.circular(HarborRadius.avatar),
      // F25: bound each cell so 200% labels wrap instead of pushing
      // the row past 360px.
      child: ConstrainedBox(
        constraints: const BoxConstraints(minWidth: 64, maxWidth: 84),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 30),
              const SizedBox(height: 6),
              Text(label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: HarborType.small)),
            ],
          ),
        ),
      ),
    );
  }
}

class _QrApproveDialog extends StatefulWidget {
  final VoidCallback? onScan;
  const _QrApproveDialog({this.onScan});

  @override
  State<_QrApproveDialog> createState() => _QrApproveDialogState();
}

class _QrApproveDialogState extends State<_QrApproveDialog> {
  final challenge = TextEditingController();
  final token = TextEditingController();

  @override
  void dispose() {
    challenge.dispose();
    token.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    return AlertDialog(
      title: Text(context.l10n.homeQrLoginTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(context.l10n.homeQrManualHint,
              style: TextStyle(fontSize: HarborType.small)),
          const SizedBox(height: 8),
          TextField(
              controller: challenge,
              decoration: const InputDecoration(
                  labelText: 'QR Challenge ID', isDense: true)),
          const SizedBox(height: 6),
          TextField(
              controller: token,
              decoration: const InputDecoration(
                  labelText: 'QR Token', isDense: true)),
        ],
      ),
      actions: [
        if (widget.onScan != null)
          TextButton(
              onPressed: widget.onScan,
              child: Text(context.l10n.homeScanCamera)),
        TextButton(
            onPressed: session.busy ? null : () => session.reload(),
            child: Text(context.l10n.reloadBtn)),
        FilledButton(
          onPressed: session.busy
              ? null
              : () {
                  Navigator.of(context).pop();
                  session.approveDesktopQR(challenge.text, token.text);
                },
          child: Text(context.l10n.mvApprove),
        ),
      ],
    );
  }
}

// F4: report-a-user sheet from the friend row menu.
Future<void> reportUserSheet(BuildContext context, SessionController session,
    String userId, String displayName) async {
  final details = TextEditingController();
  String category = 'spam';
  final labels = {
    'spam': context.l10n.reportCatSpam,
    'abuse': context.l10n.reportCatAbuse,
    'harassment': context.l10n.reportCatHarassment,
    'other': context.l10n.mvDeleteReasonOther,
  };
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => StatefulBuilder(
      builder: (sheet, setSheet) => Padding(
        padding: EdgeInsets.fromLTRB(
            16, 12, 16, 24 + MediaQuery.of(sheet).viewInsets.bottom),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
                displayName.isEmpty
                    ? sheet.l10n.reportUserBare
                    : sheet.l10n.reportUserTitle(displayName),
                style: Theme.of(sheet).textTheme.titleLarge),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: category,
              decoration: InputDecoration(labelText: context.l10n.reportCategory),
              items: [
                for (final e in labels.entries)
                  DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: (v) => setSheet(() => category = v ?? 'spam'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: details,
              decoration:
                  InputDecoration(labelText: context.l10n.homeDetailOptional),
              maxLines: 3,
              maxLength: 2000,
            ),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () {
                Navigator.of(sheet).pop();
                session.reportUser(userId, category, details.text);
              },
              child: Text(context.l10n.reportSubmit),
            ),
          ],
        ),
      ),
    ),
  );
}
