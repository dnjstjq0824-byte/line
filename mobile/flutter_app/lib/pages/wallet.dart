// Route: /wallet — LUNO Pay purser desk. Null balance renders as a dash.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

class WalletPage extends StatefulWidget {
  const WalletPage({super.key});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  final amount = TextEditingController(text: '10000');
  String? localError;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SessionScope.of(context, listen: false).loadPaymentsFlag();
    });
  }

  @override
  void dispose() {
    amount.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final line = dark ? HarborDark.channel : HarborLight.channel;
    final accent = dark ? HarborDark.harbor : HarborLight.harbor;
    BoxDecoration card() => BoxDecoration(
          color: dark ? HarborDark.surface : Colors.white,
          borderRadius: BorderRadius.circular(HarborRadius.card),
          border: Border.all(color: line),
        );
    const sectionTitle =
        TextStyle(fontSize: HarborType.body, fontWeight: FontWeight.w800);
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.mvWallet),
              // Balance card: same gradient card as the web wallet.
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(HarborRadius.sheet),
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: dark
                        ? [HarborDark.chart, HarborDark.surface]
                        : [HarborLight.harbor, Color.lerp(HarborLight.harbor, const Color(0xFF0B1A3A), 0.35)!],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('LUNO Pay',
                            style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.9),
                                fontSize: 13,
                                fontWeight: FontWeight.w700)),
                        Text(
                          session.walletPoints == null
                              ? '— P'
                              : '${session.money(session.walletPoints!)} P',
                          style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.9),
                              fontSize: 13,
                              fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(context.l10n.walletBalance,
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.75),
                            fontSize: HarborType.small)),
                    const SizedBox(height: 2),
                    Text(
                      session.walletBalance == null
                          ? '₩ —'
                          : '₩ ${session.money(session.walletBalance!)}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 30,
                          fontWeight: FontWeight.w900,
                          fontFeatures: [FontFeature.tabularFigures()]),
                    ),
                    const SizedBox(height: 16),
                    if (!session.paymentsEnabled)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.16),
                          borderRadius: BorderRadius.circular(HarborRadius.control),
                        ),
                        child: Text(context.l10n.mvPaymentsPreparing,
                            style: const TextStyle(
                                color: Colors.white, fontWeight: FontWeight.w700)),
                      ),
                    if (session.paymentsEnabled)
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: amount,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: Colors.white,
                                isDense: true,
                                hintText: context.l10n.walletTopup,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(HarborRadius.control),
                                  borderSide: BorderSide.none,
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          FilledButton(
                            style: FilledButton.styleFrom(
                              backgroundColor: Colors.white.withValues(alpha: 0.2),
                              foregroundColor: Colors.white,
                              minimumSize: const Size(72, 44),
                            ),
                            onPressed: () {
                              final parsed = int.tryParse(amount.text.trim());
                              if (parsed == null || parsed <= 0) {
                                setState(() => localError = context.l10n.walletTopupNumber);
                                return;
                              }
                              setState(() => localError = null);
                              session.chargeWallet(parsed);
                              amount.clear();
                            },
                            child: Text(context.l10n.walletTopupBtn),
                          ),
                        ],
                      ),
                    if (localError != null) ...[
                      const SizedBox(height: 8),
                      Text(localError!,
                          style: const TextStyle(
                              color: Colors.white, fontSize: HarborType.small)),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              // Shortcuts, as on the web wallet page.
              Container(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 8),
                decoration: card(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(context.l10n.walletShortcuts, style: sectionTitle),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _Shortcut(icon: Icons.shopping_bag_outlined, label: context.l10n.mvRailShop, route: '/shop', color: accent),
                        _Shortcut(icon: Icons.play_circle_outline, label: context.l10n.navFeed, route: '/feed', color: accent),
                        _Shortcut(icon: Icons.settings_outlined, label: context.l10n.settingsTitle, route: '/settings', color: accent),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 6),
                decoration: card(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(context.l10n.walletRecent, style: sectionTitle),
                    if (session.walletHistory.isEmpty)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        child: Text(context.l10n.walletNoTx,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall),
                      ),
                    for (var i = 0; i < session.walletHistory.length; i++) ...[
                      if (i > 0) Divider(height: 1, color: line),
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                  "${session.walletHistory[i]['title'] ?? session.walletHistory[i]['kind'] ?? context.l10n.walletTxWord}",
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                            ),
                            Text("${session.walletHistory[i]['amount'] ?? ''}",
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontFeatures: [FontFeature.tabularFigures()])),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.verified_user_outlined, size: 18, color: accent),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('${context.l10n.walletProtect} · ${context.l10n.walletFds}',
                        style: Theme.of(context).textTheme.bodySmall),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Shortcut extends StatelessWidget {
  final IconData icon;
  final String label;
  final String route;
  final Color color;
  const _Shortcut({required this.icon, required this.label, required this.route, required this.color});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(HarborRadius.control),
        onTap: () => context.go(route),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: dark ? HarborDark.seaGlass : HarborLight.seaGlass,
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(height: 6),
              Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: HarborType.small, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ),
    );
  }
}
