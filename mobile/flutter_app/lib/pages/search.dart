// Route: /search — dedicated search. Empty queries show removable
// recent searches (tapped friends/chats/users, client-side only).
// Typed queries filter local friends/chats instantly; server users (exact
// ID only) load as you type (debounced) and on submit. Every row acts (open chat, start chat, add friend).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/app_l10n.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final field = TextEditingController();
  String query = '';
  // Server user search state. Results belong to [searched]; while the field
  // differs from it the page shows a spinner, never "no results".
  Timer? _debounce;
  String searched = '';
  bool searching = false;
  String searchError = '';
  List<Map<String, dynamic>> found = const [];
  final Set<String> added = {};

  static const _minServerQuery = 3; // IDs are 3-20 chars; the server ignores shorter queries

  @override
  void dispose() {
    _debounce?.cancel();
    field.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    setState(() => query = v.trim());
    _debounce?.cancel();
    if (query.length >= _minServerQuery) {
      _debounce = Timer(const Duration(milliseconds: 350), () => _search(query));
    }
  }

  Future<void> _search(String q) async {
    _debounce?.cancel();
    if (q.length < _minServerQuery) return;
    final session = SessionScope.of(context, listen: false);
    setState(() {
      searching = true;
      searchError = '';
    });
    try {
      final list = await session.searchUsers(q);
      if (!mounted || q != query) return;
      setState(() {
        found = list;
        searched = q;
      });
    } catch (e) {
      if (!mounted || q != query) return;
      setState(() {
        found = const [];
        searched = q;
        searchError = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted && q == query) setState(() => searching = false);
    }
  }

  Future<void> _add(Map<String, dynamic> u) async {
    final session = SessionScope.of(context, listen: false);
    final id = '${u['id']}';
    session.rememberSearch('user', id, '${u['display_name']}');
    await session.addFriend(id);
    if (!mounted) return;
    if (session.error.isEmpty) setState(() => added.add(id));
  }

  bool _hit(Map<String, dynamic> e, List<String> keys) {
    final q = query.toLowerCase();
    return keys.any(
        (k) => (e[k]?.toString() ?? '').toLowerCase().contains(q));
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final friends = query.isEmpty
        ? const <Map<String, dynamic>>[]
        : session.friends
            .whereType<Map<String, dynamic>>()
            .where((u) => _hit(u, ['display_name', 'handle']))
            .toList();
    final chats = query.isEmpty
        ? const <Map<String, dynamic>>[]
        : session.chats
            .whereType<Map<String, dynamic>>()
            .where((c) => _hit(c, ['title']))
            .toList();
    // Server results are already matched (name, exact ID, email): no second
    // client filter, which used to drop "@id" and email queries. People
    // already listed under Friends are not repeated.
    final friendIds = friends.map((u) => '${u['id']}').toSet();
    final users = query.isNotEmpty && query == searched
        ? found.where((u) => !friendIds.contains('${u['id']}')).toList()
        : const <Map<String, dynamic>>[];
    final pending = query.length >= _minServerQuery && (searching || query != searched);
    return ListView(
      children: [
        PageColumn(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: context.l10n.backWord,
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context.go('/home'),
                ),
                Expanded(
                  child: TextField(
                    controller: field,
                    autofocus: true,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: context.l10n.mvSearch,
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: query.isEmpty
                          ? null
                          : IconButton(
                              tooltip: context.l10n.searchClear,
                              icon: const Icon(Icons.close),
                              onPressed: () {
                                field.clear();
                                setState(() => query = '');
                              },
                            ),
                      filled: true,
                      fillColor: dark
                          ? HarborDark.chart
                          : HarborLight.chart,
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
                    onChanged: _onChanged,
                    onSubmitted: (v) => _search(v.trim()),
                  ),
                ),
              ],
            ),
            if (query.isEmpty) ...[
              // Friend search is by exact ID only: say so up front.
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 10, 4, 0),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(context.l10n.searchAddByIdHint,
                      key: const ValueKey('search-add-by-id-hint'),
                      style: TextStyle(fontSize: 13, color: sub)),
                ),
              ),
              const SizedBox(height: 12),
              _ResultRow(
                icon: Icons.contacts_outlined,
                title: context.l10n.contactFindTitle,
                subtitle: context.l10n.contactFindHint,
                onTap: () => context.go('/contacts/find'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Text(context.l10n.mvRecentSearch,
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              if (session.recentSearches.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(context.l10n.searchNoRecent,
                      style: TextStyle(fontSize: 13, color: sub)),
                ),
              for (final e in session.recentSearches)
                _RecentRow(entry: e),
            ] else ...[
              if (friends.isNotEmpty) ...[
                _SectionTitle(text: context.l10n.navFriends),
                for (final u in friends)
                  _ResultRow(
                    icon: Icons.person,
                    title: '${u['display_name']}',
                    subtitle: '@${u['handle'] ?? ''}',
                    onTap: () async {
                      final id = '${u['id']}';
                      session.rememberSearch(
                          'friend', id, '${u['display_name']}');
                      final cid = await session.startChat(
                          id, '${u['display_name']}');
                      if (cid != null && context.mounted) {
                        context.go('/chats/$cid');
                      }
                    },
                  ),
              ],
              if (chats.isNotEmpty) ...[
                _SectionTitle(text: context.l10n.navChats),
                for (final c in chats)
                  _ResultRow(
                    icon: Icons.chat_bubble,
                    title: '${c['title']}',
                    onTap: () {
                      session.rememberSearch(
                          'chat', '${c['id']}', '${c['title']}');
                      context.go("/chats/${c['id']}");
                    },
                  ),
              ],
              if (users.isNotEmpty) ...[
                _SectionTitle(text: context.l10n.userWord),
                for (final u in users)
                  if (u['is_friend'] == true || added.contains('${u['id']}'))
                    _ResultRow(
                      icon: Icons.person,
                      title: '${u['display_name']}',
                      subtitle: '@${u['handle'] ?? ''}',
                      trailingLabel: context.l10n.navFriends,
                      onTap: () async {
                        final cid = await session.startChat(
                            '${u['id']}', '${u['display_name']}');
                        if (cid != null && context.mounted) {
                          context.go('/chats/$cid');
                        }
                      },
                    )
                  else
                    _ResultRow(
                      icon: Icons.person_add_alt,
                      title: '${u['display_name']}',
                      subtitle: '@${u['handle'] ?? ''}',
                      trailingLabel: context.l10n.mvAdd,
                      onTap: () => _add(u),
                    ),
              ],
              if (pending)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4)),
                  ),
                )
              else if (searchError.isNotEmpty &&
                  friends.isEmpty &&
                  chats.isEmpty &&
                  users.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(searchError,
                      style: TextStyle(fontSize: 13, color: sub)),
                )
              else if (friends.isEmpty && chats.isEmpty && users.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Text(context.l10n.searchNoResult,
                      style: TextStyle(fontSize: 13, color: sub)),
                ),
            ],
          ],
        ),
      ],
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 12, bottom: 4),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(text,
            style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }
}

class _RecentRow extends StatelessWidget {
  final Map<String, dynamic> entry;
  const _RecentRow({required this.entry});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final kind = entry['kind']?.toString() ?? '';
    final icon = kind == 'chat'
        ? Icons.chat_bubble
        : kind == 'user'
            ? Icons.person_add_alt
            : Icons.person;
    return Material(
      color: Colors.transparent,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon,
            color: dark ? HarborDark.harbor : HarborLight.harbor),
        title: Text('${entry['title']}',
            style: const TextStyle(fontWeight: FontWeight.w600)),
        trailing: IconButton(
          tooltip: context.l10n.searchDeleteRecent,
          icon: const Icon(Icons.close, size: 18),
          onPressed: () => session.forgetSearch(
              kind, '${entry['id']}'),
        ),
        onTap: () async {
          final id = '${entry['id']}';
          final title = '${entry['title']}';
          if (kind == 'chat') {
            context.go('/chats/$id');
          } else if (kind == 'friend') {
            final cid = await session.startChat(id, title);
            if (cid != null && context.mounted) {
              context.go('/chats/$cid');
            }
          } else if (kind == 'user') {
            session.addFriend(id);
          }
        },
      ),
    );
  }
}

class _ResultRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? trailingLabel;
  final VoidCallback onTap;
  const _ResultRow({
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.trailingLabel,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: Colors.transparent,
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon,
            color: dark ? HarborDark.harbor : HarborLight.harbor),
        title: Text(title,
            style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: trailingLabel == null
            ? const Icon(Icons.chevron_right, size: 20)
            : FilledButton.tonal(
                onPressed: onTap,
                child: Text(trailingLabel!),
              ),
        onTap: onTap,
      ),
    );
  }
}
