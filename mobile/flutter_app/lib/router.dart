// Harbor route map: exactly one route renders exactly one page.
// No route merges two sections — deep content (chat rooms, articles,
// chat archives, console desks) always gets its own address.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'design/responsive.dart';
import 'design/v3.dart';
import 'nav.dart';
import 'pages/apps.dart';
import 'pages/auth.dart';
import 'pages/call_detail.dart';
import 'pages/calls.dart';
import 'pages/channels.dart';
import 'pages/chat_archive.dart';
import 'pages/chat_room.dart';
import 'pages/chats.dart';
import 'pages/contact_find.dart';
import 'pages/group_settings.dart';
import 'pages/console.dart';
import 'pages/feed.dart';
import 'pages/home.dart';
import 'pages/join.dart';
import 'pages/keep.dart';
import 'pages/lounge.dart';
import 'pages/more.dart';
import 'pages/news.dart';
import 'pages/news_article.dart';
import 'pages/privacy.dart';
import 'pages/profile.dart';
import 'pages/qr_scan.dart';
import 'pages/reports.dart';
import 'pages/support.dart';
import 'pages/search.dart';
import 'pages/settings.dart';
import 'pages/shop.dart';
import 'pages/splash.dart';
import 'pages/stories.dart';
import 'pages/wallet.dart';
import 'state/session.dart';

/// The app's root navigator. The call overlays sit beside it (above the
/// router in MaterialApp.builder), so dialogs they open use this context.
final rootNavigatorKey = GlobalKey<NavigatorState>();

GoRouter buildRouter(SessionController session) {
  Page<void> harborPage(
          BuildContext context, GoRouterState state, Widget child) =>
      // Every screen is a context.go replacement, so the old page vanishes
      // at once; a fade-in from transparent flashed an empty frame on every
      // menu change. Bottom-tab roots now switch instantly (like LINE) and
      // other screens slide in quickly from the right at full opacity.
      LunoNav.primary.any((d) => d.route == state.uri.path)
          ? NoTransitionPage(
              key: state.pageKey,
              child: _SystemBack(location: state.uri.path, child: child))
          : CustomTransitionPage(
              key: state.pageKey,
              transitionDuration: const Duration(milliseconds: 220),
              reverseTransitionDuration: const Duration(milliseconds: 180),
              child: _SystemBack(location: state.uri.path, child: child),
              transitionsBuilder: (context, animation, _, child) =>
                  LunoHarbor.transition(context, animation, child),
            );

  return GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) {
      final location = state.uri.path;
      if (!session.authed && location != '/login' && location != '/splash') {
        return '/login';
      }
      if (session.authed &&
          (location == '/login' || location == '/' || location == '/splash')) {
        return '/home';
      }
      if (location == '/') return '/login';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) =>
            harborPage(context, state, const LoginPage()),
      ),
      GoRoute(
        path: '/splash',
        pageBuilder: (context, state) =>
            harborPage(context, state, const SplashPage()),
      ),
      GoRoute(
        path: '/profile',
        pageBuilder: (context, state) =>
            harborPage(context, state, const ProfilePage()),
      ),
      ShellRoute(
        builder: (context, state, child) => AdaptiveShell(child: child),
        routes: [
          GoRoute(
              path: '/home',
              pageBuilder: (c, s) => harborPage(c, s, const HomePage())),
          GoRoute(
              path: '/stories',
              pageBuilder: (c, s) => harborPage(c, s, const StoriesPage())),
          GoRoute(
              path: '/channels',
              pageBuilder: (c, s) => harborPage(c, s, const ChannelsPage())),
          GoRoute(
              path: '/chats',
              pageBuilder: (c, s) => harborPage(c, s, const ChatsPage())),
          GoRoute(
            path: '/chats/:cid',
            pageBuilder: (c, s) => harborPage(
                c, s, ChatRoomPage(conversationId: s.pathParameters['cid']!)),
            routes: [
              GoRoute(
                  path: 'pins',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      ChatArchivePage(
                          conversationId: s.pathParameters['cid']!,
                          kind: ChatArchiveKind.pins))),
              GoRoute(
                  path: 'notes',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      ChatArchivePage(
                          conversationId: s.pathParameters['cid']!,
                          kind: ChatArchiveKind.notes))),
              GoRoute(
                  path: 'events',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      ChatArchivePage(
                          conversationId: s.pathParameters['cid']!,
                          kind: ChatArchiveKind.events))),
              GoRoute(
                  path: 'polls',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      ChatArchivePage(
                          conversationId: s.pathParameters['cid']!,
                          kind: ChatArchiveKind.polls))),
              GoRoute(
                  path: 'albums',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      ChatArchivePage(
                          conversationId: s.pathParameters['cid']!,
                          kind: ChatArchiveKind.albums))),
              GoRoute(
                  path: 'settings',
                  pageBuilder: (c, s) => harborPage(
                      c,
                      s,
                      GroupSettingsPage(
                          conversationId: s.pathParameters['cid']!))),
            ],
          ),
          GoRoute(
            path: '/invite/:token',
            pageBuilder: (c, s) =>
                harborPage(c, s, JoinPage(token: s.pathParameters['token']!)),
          ),
          GoRoute(
              path: '/feed',
              pageBuilder: (c, s) => harborPage(c, s, const FeedPage())),
          GoRoute(
              path: '/lounge',
              pageBuilder: (c, s) => harborPage(c, s, const LoungePage())),
          GoRoute(
              path: '/shop',
              pageBuilder: (c, s) => harborPage(c, s, const ShopPage())),
          GoRoute(
              path: '/news',
              pageBuilder: (c, s) => harborPage(c, s, const NewsPage())),
          GoRoute(
            path: '/news/:aid',
            pageBuilder: (c, s) => harborPage(
                c, s, NewsArticlePage(articleId: s.pathParameters['aid']!)),
          ),
          GoRoute(
              path: '/calls',
              pageBuilder: (c, s) => harborPage(c, s, const CallsPage())),
          GoRoute(
            path: '/calls/:cid',
            pageBuilder: (c, s) => harborPage(
                c, s, CallDetailPage(conversationId: s.pathParameters['cid']!)),
          ),
          GoRoute(
              path: '/wallet',
              pageBuilder: (c, s) => harborPage(c, s, const WalletPage())),
          GoRoute(
              path: '/settings',
              pageBuilder: (c, s) => harborPage(c, s, const SettingsPage())),
          GoRoute(
              path: '/search',
              pageBuilder: (c, s) => harborPage(c, s, const SearchPage())),
          GoRoute(
              path: '/privacy',
              pageBuilder: (c, s) => harborPage(c, s, const PrivacyPage())),
          GoRoute(
              path: '/qr/scan',
              pageBuilder: (c, s) => harborPage(c, s, const QrScanPage())),
          GoRoute(
              path: '/reports',
              pageBuilder: (c, s) => harborPage(c, s, const ReportsPage())),
          GoRoute(
              path: '/support',
              pageBuilder: (c, s) => harborPage(c, s, const SupportPage())),
          GoRoute(
              path: '/contacts/find',
              pageBuilder: (c, s) => harborPage(c, s, const ContactFindPage())),
          GoRoute(
              path: '/keep',
              pageBuilder: (c, s) => harborPage(c, s, const KeepPage())),
          GoRoute(
              path: '/more',
              pageBuilder: (c, s) => harborPage(c, s, const MorePage())),
          GoRoute(
              path: '/apps',
              pageBuilder: (c, s) => harborPage(c, s, const AppsPage())),
          GoRoute(
              path: '/console',
              pageBuilder: (c, s) => harborPage(c, s, const ConsolePage())),
          GoRoute(
              path: '/console/users',
              pageBuilder: (c, s) =>
                  harborPage(c, s, const ConsoleUsersPage())),
          GoRoute(
              path: '/console/reports',
              pageBuilder: (c, s) =>
                  harborPage(c, s, const ConsoleReportsPage())),
          GoRoute(
              path: '/console/flags',
              pageBuilder: (c, s) =>
                  harborPage(c, s, const ConsoleFlagsPage())),
          GoRoute(
              path: '/console/audit',
              pageBuilder: (c, s) =>
                  harborPage(c, s, const ConsoleAuditPage())),
        ],
      ),
    ],
  );
}

/// Android back: close an open sheet/dialog first, then walk up to the
/// parent screen ([LunoNav.backTargetOf]); only /home leaves the app.
class _SystemBack extends StatelessWidget {
  const _SystemBack({required this.location, required this.child});
  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return BackButtonListener(
      onBackButtonPressed: () async {
        final root = Navigator.of(context, rootNavigator: true);
        final local = Navigator.of(context);
        if (local.canPop()) {
          await local.maybePop();
          return true;
        }
        if (root != local && root.canPop()) {
          await root.maybePop();
          return true;
        }
        final target = LunoNav.backTargetOf(location);
        if (target == null) return false;
        if (context.mounted) context.go(target);
        return true;
      },
      child: child,
    );
  }
}
