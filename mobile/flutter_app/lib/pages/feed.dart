// Route: /feed — VOOM logbook. Composer + posts, nothing else.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final composer = TextEditingController();

  @override
  void dispose() {
    composer.dispose();
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
        children: [
          PageColumn(
            children: [
              const Masthead(title: '피드', subtitle: 'LUNO 항해 일지'),
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(color: line),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    children: [
                      TextField(
                        controller: composer,
                        maxLines: 3,
                        minLines: 1,
                        decoration: const InputDecoration(
                          hintText: 'LUNO 피드에 새로운 소식을 공유하세요...',
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          filled: false,
                        ),
                      ),
                      Align(
                        alignment: Alignment.centerRight,
                        child: FilledButton.icon(
                          onPressed: () {
                            session.createFeedPost(composer.text);
                            composer.clear();
                          },
                          icon: const Icon(Icons.send, size: 16),
                          label: const Text('피드 게시'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              for (final p in session.feedPosts)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Card(
                    color: dark ? HarborDark.surface : Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(HarborRadius.card),
                      side: BorderSide(color: line),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text("${p['author']} ${p['handle'] ?? ''}",
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                              ),
                              Text('${p['time'] ?? ''}',
                                  style: Theme.of(context).textTheme.bodySmall),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text("${p['body']}",
                              style: const TextStyle(height: 1.45)),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              TextButton.icon(
                                onPressed: () => session.likeFeed('${p['id']}'),
                                icon: Icon(
                                  p['liked'] == true
                                      ? Icons.favorite
                                      : Icons.favorite_border,
                                  color: dark
                                      ? HarborDark.danger
                                      : HarborLight.danger,
                                  size: 18,
                                ),
                                label: Text('${p['likes'] ?? 0}'),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '댓글 ${(p['comments'] as List?)?.length ?? 0}개',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
