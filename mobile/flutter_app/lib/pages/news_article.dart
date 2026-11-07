// Route: /news/:aid — one article, one page.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../state/session.dart';
import 'news.dart';

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
              const Masthead(title: '기사', subtitle: '전보를 찾을 수 없습니다'),
              FilledButton.tonal(
                onPressed: session.reload,
                child: const Text('뉴스 다시 불러오기'),
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
