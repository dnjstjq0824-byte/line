// Route: /splash — LUNO launch screen, shown once at startup.
// The Orbit Crew introduces the brand (reference structure, LUNO face).
// Brand moment only: it forwards to /login (the router redirect sends
// restored sessions to /home). Frame-driven via TweenAnimationBuilder so
// widget tests settle through it with no pending timers.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/v3.dart';
import '../legacy_tokens.dart';

class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: const Key('luno-splash'),
      backgroundColor: LunoBrand.deep,
      body: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0.85, end: 1.0),
        duration: const Duration(milliseconds: 1400),
        curve: Curves.easeOutBack,
        onEnd: () {
          if (context.mounted) context.go('/login');
        },
        builder: (context, scale, child) => Center(
          child: Transform.scale(scale: scale, child: child),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final s in lunoOrbitCrewStickers)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: CrewBadge(
                      emoji: s['emoji']!,
                      name: s['character']!,
                      size: 44,
                      background: Colors.white.withValues(alpha: 0.14),
                      nameColor: Colors.white,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 28),
            const Text('LUNO',
                style: TextStyle(
                    fontSize: 44,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.5,
                    color: Colors.white)),
            const SizedBox(height: 6),
            Text('Connect Beyond Borders',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.white.withValues(alpha: 0.75))),
          ],
        ),
      ),
    );
  }
}
