// Route: /news — LINE-style news. A swipeable hero carousel over every
// GET /api/v1/news hero (segment indicator included), then ranked popular
// rows with thumbnails. Articles open on their own route (/news/:aid).
// Gear and ad rows are omitted: no backend serves them.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

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
        context.l10n.mvNewsSampleBanner,
        style: TextStyle(
            fontSize: HarborType.small, color: dark ? HarborDark.buoyInk : HarborLight.buoyInk),
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
          children: [
            PageColumn(
              children: [
                Masthead(title: context.l10n.mvNews),
                const SizedBox(height: 64),
                Icon(Icons.newspaper_outlined,
                    size: 48, color: dark ? HarborDark.drift : HarborLight.drift),
                const SizedBox(height: 12),
                Text(context.l10n.newsEmpty,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                Text(context.l10n.newsPullRefresh,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ],
        ),
      );
    }
    final heroes =
        session.newsHero.whereType<Map<String, dynamic>>().toList();
    final line = dark ? HarborDark.channel : HarborLight.channel;
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.mvNews),
              if (session.newsIsSample) const NewsSampleBanner(),
              if (heroes.isNotEmpty)
                LayoutBuilder(builder: (context, box) {
                  // 16:10 photo plus two title lines and the byline. The
                  // text reserve grows with the user's text scale (F25) so
                  // 200% text still fits; at 1.0x this is the old 84.
                  final textReserve =
                      84 * MediaQuery.textScalerOf(context).scale(1.0);
                  final height = box.maxWidth * 10 / 16 + textReserve;
                  return SizedBox(
                    height: height,
                    child: PageView.builder(
                      itemCount: heroes.length,
                      onPageChanged: (i) => setState(() => _heroPage = i),
                      itemBuilder: (context, i) =>
                          _HeroCard(article: heroes[i], index: i),
                    ),
                  );
                }),
              if (heroes.length > 1) ...[
                const SizedBox(height: 10),
                Row(
                  key: const ValueKey('hero-segments'),
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < heroes.length; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: i == _heroPage ? 20 : 7,
                        height: 7,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(HarborRadius.lamp),
                          color: i == _heroPage
                              ? (dark ? HarborDark.harbor : HarborLight.harbor)
                              : line,
                        ),
                      ),
                  ],
                ),
              ],
              if (session.newsPopular.isNotEmpty) ...[
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.fromLTRB(14, 14, 14, 4),
                  decoration: BoxDecoration(
                    color: dark ? HarborDark.surface : Colors.white,
                    borderRadius: BorderRadius.circular(HarborRadius.card),
                    border: Border.all(color: line),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(context.l10n.mvTodayPopular,
                          style: const TextStyle(
                              fontSize: HarborType.body, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 4),
                      for (var i = 0; i < session.newsPopular.length; i++) ...[
                        if (i > 0) Divider(height: 1, color: line),
                        _NewsRow(
                          article:
                              session.newsPopular[i] as Map<String, dynamic>,
                          fallbackRank: i + 1,
                        ),
                      ],
                    ],
                  ),
                ),
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
    final placeholder =
        Container(color: dark ? HarborDark.chart : HarborLight.seaGlass);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 2),
      child: Material(
        color: dark ? HarborDark.surface : Colors.white,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(HarborRadius.sheet),
          side: BorderSide(color: dark ? HarborDark.channel : HarborLight.channel),
        ),
        child: InkWell(
          onTap: () => context.go('/news/hero-$index'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 16 / 10,
                child: imageUrl.isNotEmpty
                    ? Image.network(imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (context, _, __) => placeholder)
                    : placeholder,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      newsField(article, 'title'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: HarborType.title,
                          fontWeight: FontWeight.w800,
                          height: 1.3),
                    ),
                    const SizedBox(height: 4),
                    Text(newsByline(session, article),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
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
    final thumbBg = dark ? HarborDark.chart : HarborLight.seaGlass;
    return InkWell(
      onTap: () => context.go('/news/${newsAddress(session, article)}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            SizedBox(
              width: 22,
              child: Text('$rank',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: HarborType.body,
                      fontWeight: FontWeight.w800,
                      color: dark ? HarborDark.harbor : HarborLight.harbor)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(newsField(article, 'title'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700, height: 1.35)),
                  const SizedBox(height: 4),
                  Text(newsByline(session, article),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
            const SizedBox(width: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(HarborRadius.control),
              child: SizedBox(
                width: 72,
                height: 54,
                child: imageUrl.isNotEmpty
                    ? Image.network(imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (context, _, __) => Container(
                              color: thumbBg,
                              child: Icon(Icons.newspaper_outlined,
                                  color: dark ? HarborDark.drift : HarborLight.drift),
                            ))
                    : Container(color: thumbBg),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
