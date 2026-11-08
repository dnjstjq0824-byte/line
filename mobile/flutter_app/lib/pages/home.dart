// Route: /home — reference-parity home. Profile header (opens /profile),
// search, service shortcuts, official accounts, collapsible friends.
// Stories and official channels live on their own routes (/stories,
// /channels) and are only linked here. Friend rows still open chats.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/v3.dart';
import '../state/session.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final search = TextEditingController();
  bool friendsOpen = true;

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final name = session.selfName.isEmpty ? '내 프로필' : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? '상태 메시지 입력'
        : session.selfStatusMessage;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          InkWell(
            onTap: () => context.go('/profile'),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 2),
                        Text(status,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  LineAvatar(
                    glyph: name,
                    color: dark ? HarborDark.harbor : HarborLight.harbor,
                    size: 56,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: search,
            textInputAction: TextInputAction.search,
            decoration: InputDecoration(
              hintText: '검색',
              prefixIcon: const Icon(Icons.search),
              filled: true,
              fillColor:
                  dark ? HarborDark.chart : const Color(0xFFF1F3F4),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(20),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(20),
                borderSide: BorderSide.none,
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(20),
                borderSide: BorderSide.none,
              ),
              isDense: true,
            ),
            onSubmitted: (_) => session.find(search.text),
          ),
          for (final u in session.results)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('${u['display_name']}'),
              subtitle: Text('@${u['handle'] ?? ''}'),
              trailing: FilledButton.tonal(
                onPressed: () => session.addFriend(u['id']),
                child: const Text('친구 추가'),
              ),
            ),
          const SizedBox(height: 16),
          Text('서비스', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          const Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _ServiceButton(
                  icon: Icons.auto_stories_outlined,
                  label: '스토리',
                  route: '/stories'),
              _ServiceButton(
                  icon: Icons.verified_outlined,
                  label: '공식 채널',
                  route: '/channels'),
              _ServiceButton(
                  icon: Icons.bookmark_border,
                  label: 'Keep',
                  route: '/keep'),
              _ServiceButton(
                  icon: Icons.account_balance_wallet_outlined,
                  label: '지갑',
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
            title: const Text('공식 계정',
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
          InkWell(
            onTap: () => setState(() => friendsOpen = !friendsOpen),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  Expanded(
                    child: Text('친구 (${session.friends.length})',
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
                title: Text('${u['display_name']}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(
                    '${u['status_message'] ?? '@${u['handle'] ?? ''}'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall),
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
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          children: [
            Icon(icon, size: 30),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
