// Route: /news — signal wire. Every card renders GET /api/v1/news only.
// Articles open on their own route (/news/:aid), never a stacked sheet.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

String newsField(Map<String, dynamic> article, String key) =>
    article[key]?.toString() ?? '';

String newsByline(SessionController session, Map<String, dynamic> article) {
  final press = newsField(article, 'press');
  final when = session.relTime(article['published_at']);
  if (press.isEmpty) return when;
  if (when.isEmpty) return press;
  return '$press · $when';
}

/// Stable address for an article: `hero` or `popular-N`.
String newsAddress(SessionController session, Map<String, dynamic> article) {
  final heroIndex = session.newsHero.indexWhere((h) => identical(h, article));
  if (heroIndex >= 0) return 'hero';
  final popularIndex =
      session.newsPopular.indexWhere((p) => identical(p, article));
  if (popularIndex >= 0) return 'popular-$popularIndex';
  return 'popular-0';
}

Map<String, dynamic>? resolveArticle(SessionController session, String aid) {
  if (aid == 'hero' && session.newsHero.isNotEmpty) {
    return session.newsHero.first as Map<String, dynamic>;
  }
  if (aid.startsWith('popular-')) {
    final i = int.tryParse(aid.substring('popular-'.length)) ?? -1;
    if (i >= 0 && i < session.newsPopular.length) {
      return session.newsPopular[i] as Map<String, dynamic>;
    }
  }
  return null;
}

class NewsSampleBanner extends StatelessWidget {
  const NewsSampleBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: dark ? HarborDark.buoyBg : HarborLight.buoyBg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        'LUNO 에디토리얼 샘플 콘텐츠입니다. 실제 언론 기사가 아닙니다.',
        style: TextStyle(
            fontSize: 12, color: dark ? HarborDark.buoyInk : HarborLight.buoyInk),
      ),
    );
  }
}

class NewsPage extends StatelessWidget {
  const NewsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (session.newsHero.isEmpty && session.newsPopular.isEmpty) {
      return RefreshIndicator(
        onRefresh: session.reload,
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            const SizedBox(height: 80),
            Icon(Icons.newspaper_outlined,
                size: 48, color: dark ? HarborDark.channel : HarborLight.channel),
            const SizedBox(height: 12),
            Text('표시할 뉴스가 없습니다',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text('아래로 당겨 새로고침하세요',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      );
    }
    final hero = session.newsHero.isNotEmpty
        ? session.newsHero.first as Map<String, dynamic>
        : null;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '뉴스', subtitle: 'LUNO 신호 전보'),
              if (session.newsIsSample) const NewsSampleBanner(),
              if (hero != null)
                Card(
                  clipBehavior: Clip.antiAlias,
                  shape: RoundedRectangleBorder(
                      borderRadius:
                          BorderRadius.circular(HarborRadius.card)),
                  child: InkWell(
                    onTap: () => context
                        .go('/news/${newsAddress(session, hero)}'),
                    child: Container(
                      width: double.infinity,
                      color:
                          dark ? HarborDark.chart : HarborLight.harbor,
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const LampBar(height: 16),
                              const SizedBox(width: 8),
                              Text('헤드라인',
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: dark
                                          ? HarborDark.beacon
                                          : HarborLight.seaGlass)),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(
                            newsField(hero, 'title'),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                height: 1.3),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            newsByline(session, hero),
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.75),
                                fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (session.newsPopular.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('오늘의 인기 기사',
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                for (var i = 0; i < session.newsPopular.length; i++) ...[
                  if (i > 0) const Divider(height: 1),
                  _NewsRow(
                    article:
                        session.newsPopular[i] as Map<String, dynamic>,
                    fallbackRank: i + 1,
                  ),
                ],
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _NewsRow extends StatelessWidget {
  final Map<String, dynamic> article;
  final int fallbackRank;
  const _NewsRow({required this.article, required this.fallbackRank});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final rank = article['rank'] is int ? article['rank'] as int : fallbackRank;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
      onTap: () =>
          context.go('/news/${newsAddress(session, article)}'),
      leading: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: dark ? HarborDark.chart : HarborLight.chart,
          borderRadius: BorderRadius.circular(HarborRadius.control),
        ),
        child: Text('$rank',
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      ),
      title: Text(newsField(article, 'title'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      subtitle: Text(newsByline(session, article),
          style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
