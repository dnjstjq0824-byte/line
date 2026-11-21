// Route: /stories — 24-hour stories, own page (was a strip inside home).
import 'package:flutter/material.dart';

import '../widgets/no_pull_refresh.dart';
import '../widgets/harbor_empty.dart';
import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class StoriesPage extends StatelessWidget {
  const StoriesPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final kind = DeviceScope.of(context);
    final columns = switch (kind) {
      DeviceKind.desktop => 4,
      DeviceKind.tablet => 3,
      DeviceKind.mobile => 2,
      DeviceKind.compactApp => 1,
    };
    return NoPullRefresh(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(
                title: context.l10n.storyWord,
                subtitle: context.l10n.storyEphemeral,
              ),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                  onPressed: () => _postDialog(context),
                  icon: const Icon(Icons.add, size: 18),
                  label: Text(context.l10n.storyWrite),
                ),
              ),
              const SizedBox(height: 8),
              if (session.stories.isEmpty)
                HarborEmpty(
                  title: context.l10n.storyEmpty,
                  icon: Icons.auto_awesome_outlined,
                )
              else
                GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: columns,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 1.4,
                  ),
                  itemCount: session.stories.length,
                  itemBuilder: (_, i) {
                    final s = session.stories[i];
                    return Card(
                      color: dark ? HarborDark.surface : Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(HarborRadius.card),
                        side: BorderSide(
                            color: dark ? HarborDark.beacon : HarborLight.beacon,
                            width: 1.4),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text('${s['emoji'] ?? ''} ${s['author_name'] ?? context.l10n.navFriends}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700, fontSize: 13),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 4),
                            Text('${s['text'] ?? ''}',
                                style: Theme.of(context).textTheme.bodySmall,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                    );
                  },
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _postDialog(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final body = TextEditingController();
    showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(context.l10n.storyWrite),
        content: TextField(
            controller: body,
            maxLines: 3,
            maxLength: 200,
            decoration: InputDecoration(
                hintText: context.l10n.storyHint, isDense: true)),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: Text(context.l10n.mvCancel)),
          FilledButton(
            onPressed: () async {
              await session.postStory(body.text);
              if (!dialog.mounted) return;
              Navigator.of(dialog).pop();
            },
            child: Text(context.l10n.storyPost),
          ),
        ],
      ),
    );
  }
}
