// Route: /news — LINE-style news. A swipeable hero carousel over every
// GET /api/v1/news hero (segment indicator included), then ranked popular
// rows with thumbnails. Articles open on their own route (/news/:aid).
// Gear and ad rows are omitted: no backend serves them.
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

/// Stable address for an article: `hero-N` or `popular-N`.
String newsAddress(SessionController session, Map<String, dynamic> article) {
  final heroIndex = session.newsHero.indexWhere((h) => identical(h, article));
  if (heroIndex >= 0) return 'hero-$heroIndex';
  final popularIndex =
      session.newsPopular.indexWhere((p) => identical(p, article));
  if (popularIndex >= 0) return 'popular-$popularIndex';
  return 'popular-0';
}

Map<String, dynamic>? resolveArticle(SessionController session, String aid) {
  if (aid == 'hero' && session.newsHero.isNotEmpty) {
    return session.newsHero.first as Map<String, dynamic>;
  }
  if (aid.startsWith('hero-')) {
    final i = int.tryParse(aid.substring('hero-'.length)) ?? -1;
    if (i >= 0 && i < session.newsHero.length) {
      return session.newsHero[i] as Map<String, dynamic>;
    }
    return null;
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

class NewsPage extends StatefulWidget {
  const NewsPage({super.key});

  @override
  State<NewsPage> createState() => _NewsPageState();
}

class _NewsPageState extends State<NewsPage> {
  int _heroPage = 0;

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
    final heroes =
        session.newsHero.whereType<Map<String, dynamic>>().toList();
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              const Masthead(title: '뉴스'),
              if (session.newsIsSample) const NewsSampleBanner(),
              if (heroes.isNotEmpty) ...[
                SizedBox(
                  height: 220,
                  child: PageView.builder(
                    itemCount: heroes.length,
                    onPageChanged: (i) => setState(() => _heroPage = i),
                    itemBuilder: (context, i) =>
                        _HeroCard(article: heroes[i], index: i),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  key: const ValueKey('hero-segments'),
                  children: [
                    for (var i = 0; i < heroes.length; i++)
                      Expanded(
                        child: Container(
                          height: 3,
                          margin: EdgeInsets.only(
                              left: i == 0 ? 0 : 4),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(2),
                            color: i == _heroPage
                                ? (dark
                                    ? Colors.white
                                    : HarborLight.harbor)
                                : (dark
                                    ? Colors.white24
                                    : HarborLight.channel),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
              if (session.newsPopular.isNotEmpty) ...[
                const SizedBox(height: 16),
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

class _HeroCard extends StatelessWidget {
  final Map<String, dynamic> article;
  final int index;
  const _HeroCard({required this.article, required this.index});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final imageUrl = newsField(article, 'image_url');
    return Card(
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HarborRadius.card)),
      child: InkWell(
        onTap: () => context.go('/news/hero-$index'),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (imageUrl.isNotEmpty)
              Image.network(
                imageUrl,
                fit: BoxFit.cover,
                errorBuilder: (context, _, __) => Container(
                    color: dark ? HarborDark.chart : HarborLight.harbor),
              )
            else
              Container(
                  color: dark ? HarborDark.chart : HarborLight.harbor),
            Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.transparent, Colors.black87],
                ),
              ),
            ),
            Positioned(
              left: 16,
              right: 16,
              bottom: 14,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    newsField(article, 'title'),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        height: 1.3),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    newsByline(session, article),
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.75),
                        fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
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
    final imageUrl = newsField(article, 'image_url');
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
      onTap: () =>
          context.go('/news/${newsAddress(session, article)}'),
      leading: SizedBox(
        width: 72,
        height: 72,
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: imageUrl.isNotEmpty
                  ? Image.network(
                      imageUrl,
                      width: 72,
                      height: 72,
                      fit: BoxFit.cover,
                      errorBuilder: (context, _, __) => Container(
                        width: 72,
                        height: 72,
                        color:
                            dark ? HarborDark.chart : HarborLight.chart,
                        child: Icon(Icons.newspaper_outlined,
                            color: dark
                                ? HarborDark.channel
                                : HarborLight.channel),
                      ),
                    )
                  : Container(
                      width: 72,
                      height: 72,
                      color: dark ? HarborDark.chart : HarborLight.chart,
                    ),
            ),
            Positioned(
              left: 4,
              top: 4,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black87,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text('$rank',
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 12)),
              ),
            ),
          ],
        ),
      ),
      title: Text(newsField(article, 'title'),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
      subtitle: Text(newsByline(session, article),
          style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
