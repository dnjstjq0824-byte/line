// Route: /wallet — LUNO Pay purser desk. Null balance renders as a dash.
import 'package:flutter/material.dart';

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
    return RefreshIndicator(
      onRefresh: session.reload,
      child: ListView(
        children: [
          PageColumn(
            children: [
              Masthead(title: context.l10n.mvWallet, subtitle: context.l10n.walletLedger),
              Card(
                color: dark ? HarborDark.surface : HarborLight.harbor,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(HarborRadius.sheet)),
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(context.l10n.walletBalance,
                              style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600)),
                          Icon(Icons.account_balance_wallet,
                              color: dark
                                  ? HarborDark.harbor
                                  : HarborLight.seaGlass),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        session.walletBalance == null
                            ? '₩ —'
                            : '₩ ${session.money(session.walletBalance!)}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 28,
                            fontWeight: FontWeight.w900,
                            fontFeatures: [FontFeature.tabularFigures()]),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.15),
                          borderRadius:
                              BorderRadius.circular(HarborRadius.lamp),
                        ),
                        child: Text(
                          session.walletPoints == null
                              ? 'LUNO POINTS: —'
                              : 'LUNO POINTS: ${session.money(session.walletPoints!)} P',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: HarborType.small,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (!session.paymentsEnabled)
                        Text(context.l10n.mvPaymentsPreparing,
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700)),
                      if (session.paymentsEnabled)
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: amount,
                                keyboardType: TextInputType.number,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700),
                                decoration: InputDecoration(
                                  filled: true,
                                  fillColor: Colors.white,
                                  isDense: true,
                                  hintText: context.l10n.walletTopup,
                                  border: InputBorder.none,
                                  enabledBorder: InputBorder.none,
                                  focusedBorder: InputBorder.none,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              style: FilledButton.styleFrom(
                                backgroundColor: dark
                                    ? HarborDark.beacon
                                    : HarborLight.beacon,
                                foregroundColor: Colors.white,
                              ),
                              onPressed: () {
                                final parsed =
                                    int.tryParse(amount.text.trim());
                                if (parsed == null || parsed <= 0) {
                                  setState(() => localError =
                                      context.l10n.walletTopupNumber);
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
              ),
              const SizedBox(height: 12),
              Card(
                color: dark ? HarborDark.surface : Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(HarborRadius.card),
                  side: BorderSide(
                      color: dark ? HarborDark.channel : HarborLight.channel),
                ),
                child: ListTile(
                  leading: Icon(Icons.security,
                      color: dark ? HarborDark.harbor : HarborLight.harbor),
                  title: Text(context.l10n.walletProtect,
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  subtitle: Text(context.l10n.walletFds,
                      style: Theme.of(context).textTheme.bodySmall),
                ),
              ),
              if (session.walletHistory.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(context.l10n.walletRecent, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                for (final h in session.walletHistory)
                  ListTile(
                    dense: true,
                    title: Text("${h['title'] ?? h['kind'] ?? context.l10n.walletTxWord}",
                        style: const TextStyle(fontSize: 13)),
                    trailing: Text("${h['amount'] ?? ''}",
                        style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontFeatures: [FontFeature.tabularFigures()])),
                  ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
