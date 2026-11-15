// Route: /news/:aid — one article, one page.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../state/session.dart';
import 'news.dart';
import '../util/app_l10n.dart';

class NewsArticlePage extends StatelessWidget {
  final String articleId;
  const NewsArticlePage({super.key, required this.articleId});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final article = resolveArticle(session, articleId);
    if (article == null) {
      return ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.newsArticleWord, subtitle: context.l10n.newsNotFound),
              FilledButton.tonal(
                onPressed: session.reload,
                child: Text(context.l10n.newsReload),
              ),
            ],
          ),
        ],
      );
    }
    final body = newsField(article, 'content').isNotEmpty
        ? newsField(article, 'content')
        : newsField(article, 'summary');
    return ListView(
      children: [
        PageColumn(
          children: [
            if (session.newsIsSample) const NewsSampleBanner(),
            Text(newsField(article, 'title'),
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w800, height: 1.35)),
            const SizedBox(height: 8),
            Text(newsByline(session, article),
                style: Theme.of(context).textTheme.bodySmall),
            const Divider(height: 24),
            Text(body, style: const TextStyle(fontSize: 14, height: 1.65)),
          ],
        ),
      ],
    );
  }
}
