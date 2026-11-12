// Harbor route map: exactly one route renders exactly one page.
// No route merges two sections — deep content (chat rooms, articles,
// chat archives, console desks) always gets its own address.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'design/responsive.dart';
import 'design/v3.dart';
import 'pages/apps.dart';
import 'pages/auth.dart';
import 'pages/call_detail.dart';
import 'pages/calls.dart';
import 'pages/channels.dart';
import 'pages/chat_archive.dart';
import 'pages/chat_room.dart';
import 'pages/chats.dart';
import 'pages/console.dart';
import 'pages/feed.dart';
import 'pages/home.dart';
import 'pages/keep.dart';
import 'pages/lounge.dart';
import 'pages/more.dart';
import 'pages/news.dart';
import 'pages/news_article.dart';
import 'pages/privacy.dart';
import 'pages/profile.dart';
import 'pages/qr_scan.dart';
import 'pages/search.dart';
import 'pages/settings.dart';
import 'pages/shop.dart';
import 'pages/splash.dart';
import 'pages/stories.dart';
import 'pages/wallet.dart';
import 'state/session.dart';

GoRouter buildRouter(SessionController session) {
  Page<void> harborPage(BuildContext context, GoRouterState state, Widget child) =>
      CustomTransitionPage(
        key: state.pageKey,
        child: child,
        transitionsBuilder: (context, animation, _, child) =>
            LunoHarbor.transition(context, animation, child),
      );

  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) {
      final location = state.uri.path;
      if (!session.authed && location != '/login' && location != '/splash') {
        return '/login';
      }
      if (session.authed &&
          (location == '/login' ||
              location == '/' ||
              location == '/splash')) {
        return '/home';
      }
      if (location == '/') return '/login';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => harborPage(context, state, const LoginPage()),
      ),
      GoRoute(
        path: '/splash',
        pageBuilder: (context, state) => harborPage(context, state, const SplashPage()),
      ),
      GoRoute(
        path: '/profile',
        pageBuilder: (context, state) => harborPage(context, state, const ProfilePage()),
      ),
      ShellRoute(
        builder: (context, state, child) => AdaptiveShell(child: child),
        routes: [
          GoRoute(path: '/home', pageBuilder: (c, s) => harborPage(c, s, const HomePage())),
          GoRoute(path: '/stories', pageBuilder: (c, s) => harborPage(c, s, const StoriesPage())),
          GoRoute(path: '/channels', pageBuilder: (c, s) => harborPage(c, s, const ChannelsPage())),
          GoRoute(path: '/chats', pageBuilder: (c, s) => harborPage(c, s, const ChatsPage())),
          GoRoute(
            path: '/chats/:cid',
            pageBuilder: (c, s) => harborPage(c, s, ChatRoomPage(conversationId: s.pathParameters['cid']!)),
            routes: [
              GoRoute(
                path: 'pins',
                pageBuilder: (c, s) => harborPage(
                    c, s, ChatArchivePage(conversationId: s.pathParameters['cid']!, kind: ChatArchiveKind.pins))),
              GoRoute(
                path: 'notes',
                pageBuilder: (c, s) => harborPage(
                    c, s, ChatArchivePage(conversationId: s.pathParameters['cid']!, kind: ChatArchiveKind.notes))),
              GoRoute(
                path: 'events',
                pageBuilder: (c, s) => harborPage(
                    c, s, ChatArchivePage(conversationId: s.pathParameters['cid']!, kind: ChatArchiveKind.events))),
              GoRoute(
                path: 'polls',
                pageBuilder: (c, s) => harborPage(
                    c, s, ChatArchivePage(conversationId: s.pathParameters['cid']!, kind: ChatArchiveKind.polls))),
              GoRoute(
                path: 'albums',
                pageBuilder: (c, s) => harborPage(
                    c, s, ChatArchivePage(conversationId: s.pathParameters['cid']!, kind: ChatArchiveKind.albums))),
            ],
          ),
          GoRoute(path: '/feed', pageBuilder: (c, s) => harborPage(c, s, const FeedPage())),
          GoRoute(path: '/lounge', pageBuilder: (c, s) => harborPage(c, s, const LoungePage())),
          GoRoute(path: '/shop', pageBuilder: (c, s) => harborPage(c, s, const ShopPage())),
          GoRoute(path: '/news', pageBuilder: (c, s) => harborPage(c, s, const NewsPage())),
          GoRoute(
            path: '/news/:aid',
            pageBuilder: (c, s) => harborPage(c, s, NewsArticlePage(articleId: s.pathParameters['aid']!)),
          ),
          GoRoute(path: '/calls', pageBuilder: (c, s) => harborPage(c, s, const CallsPage())),
          GoRoute(
            path: '/calls/:cid',
            pageBuilder: (c, s) => harborPage(c, s, CallDetailPage(conversationId: s.pathParameters['cid']!)),
          ),
          GoRoute(path: '/wallet', pageBuilder: (c, s) => harborPage(c, s, const WalletPage())),
          GoRoute(path: '/settings', pageBuilder: (c, s) => harborPage(c, s, const SettingsPage())),
          GoRoute(path: '/search', pageBuilder: (c, s) => harborPage(c, s, const SearchPage())),
          GoRoute(path: '/privacy', pageBuilder: (c, s) => harborPage(c, s, const PrivacyPage())),
          GoRoute(path: '/qr/scan', pageBuilder: (c, s) => harborPage(c, s, const QrScanPage())),
          GoRoute(path: '/keep', pageBuilder: (c, s) => harborPage(c, s, const KeepPage())),
          GoRoute(path: '/more', pageBuilder: (c, s) => harborPage(c, s, const MorePage())),
          GoRoute(path: '/apps', pageBuilder: (c, s) => harborPage(c, s, const AppsPage())),
          GoRoute(path: '/console', pageBuilder: (c, s) => harborPage(c, s, const ConsolePage())),
          GoRoute(
            path: '/console/users',
            pageBuilder: (c, s) => harborPage(c, s, const ConsoleUsersPage())),
          GoRoute(
            path: '/console/reports',
            pageBuilder: (c, s) => harborPage(c, s, const ConsoleReportsPage())),
          GoRoute(
            path: '/console/flags',
            pageBuilder: (c, s) => harborPage(c, s, const ConsoleFlagsPage())),
          GoRoute(
            path: '/console/audit',
            pageBuilder: (c, s) => harborPage(c, s, const ConsoleAuditPage())),
        ],
      ),
    ],
  );
}
