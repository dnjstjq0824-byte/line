// Route: /home — my berth + friend roster. Stories and official channels
// live on their own routes (/stories, /channels) and are only linked here.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final search = TextEditingController();

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final line = dark ? HarborDark.channel : HarborLight.channel;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          PageColumn(
            children: [
              Masthead(
                title: '홈',
                subtitle: session.selfHandle.isEmpty
                    ? '내 정박지와 친구 명부'
                    : '@${session.selfHandle}의 정박지',
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OutlinedButton(
                      onPressed: () => context.go('/stories'),
                      child: const Text('스토리'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton(
                      onPressed: () => context.go('/channels'),
                      child: const Text('공식 채널'),
                    ),
                  ],
                ),
              ),
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(color: line),
                ),
                child: ListTile(
                  leading: IdentityTile(
                    glyph: session.selfName.isEmpty ? '나' : session.selfName,
                    color: dark ? HarborDark.harbor : HarborLight.harbor,
                    size: 44,
                  ),
                  title: Text(
                    session.selfName.isEmpty ? '내 프로필' : session.selfName,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  subtitle: Text(
                    session.selfStatusMessage.isEmpty
                        ? 'Connect Beyond Borders'
                        : session.selfStatusMessage,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                      borderRadius: BorderRadius.circular(HarborRadius.lamp),
                    ),
                    child: Text('LUNO Keep',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: dark ? HarborDark.ink : HarborLight.harbor)),
                  ),
                  onTap: () => context.go('/keep'),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: search,
                      decoration: const InputDecoration(
                        hintText: '이름 또는 @핸들로 LUNO 친구 검색',
                        prefixIcon: Icon(Icons.search),
                        isDense: true,
                      ),
                      onSubmitted: (_) => session.find(search.text),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: () => session.find(search.text),
                    child: const Text('검색'),
                  ),
                ],
              ),
              for (final u in session.results)
                ListTile(
                  title: Text('${u['display_name']}'),
                  subtitle: Text('@${u['handle'] ?? ''}'),
                  trailing: FilledButton.tonal(
                    onPressed: () => session.addFriend(u['id']),
                    child: const Text('친구 추가'),
                  ),
                ),
              const SizedBox(height: 12),
              Text('친구 (${session.friends.length})',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 4),
              for (final u in session.friends)
                ListTile(
                  leading: IdentityTile(
                    glyph: '${u['display_name'] ?? 'U'}',
                    color: session.colorFromHex(
                        u['peer_color']?.toString(),
                        dark ? HarborDark.harbor : HarborLight.harbor),
                  ),
                  title: Text('${u['display_name']}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('${u['status_message'] ?? '@${u['handle'] ?? ''}'}',
                      style: Theme.of(context).textTheme.bodySmall),
                  trailing: const Icon(Icons.chat_bubble_outline),
                  onTap: () async {
                    final id = await session.startChat(u['id'], u['display_name']);
                    if (id != null && context.mounted) {
                      context.go('/chats/$id');
                    }
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }
}
