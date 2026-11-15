// Route: /feed — VOOM logbook. Composer + posts, nothing else.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

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
              Masthead(title: context.l10n.navFeed, subtitle: context.l10n.feedLogTitle),
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
                        decoration: InputDecoration(
                          hintText: context.l10n.feedComposerHint,
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
                          label: Text(context.l10n.feedPublish),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              if (session.feedPosts.isEmpty)
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CrewBadge.mascot(),
                      SizedBox(height: 12),
                      Text(
                        context.l10n.feedEmpty,
                        textAlign: TextAlign.center,
                        style: TextStyle(height: 1.5),
                      ),
                    ],
                  ),
                ),
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
                                child: Text("${p['author'] ?? 'LUNO'} ${p['handle'] ?? ''}",
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                              ),
                              Text(session.relTime('${p['created_at'] ?? ''}'),
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
                                context.l10n.feedCommentCount((p['comments'] as List?)?.length ?? 0),
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
