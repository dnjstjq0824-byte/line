// Route: /wallet — LUNO Pay purser desk. Null balance renders as a dash.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class WalletPage extends StatefulWidget {
  const WalletPage({super.key});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  final amount = TextEditingController(text: '10000');
  String? localError;

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
              const Masthead(title: '지갑', subtitle: 'LUNO Pay 출납부'),
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
                          Text('LUNO Pay 머니 잔액',
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
                              fontSize: 12,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: amount,
                              keyboardType: TextInputType.number,
                              style: const TextStyle(fontWeight: FontWeight.w700),
                              decoration: const InputDecoration(
                                filled: true,
                                fillColor: Colors.white,
                                isDense: true,
                                hintText: '충전 금액',
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
                                setState(() =>
                                    localError = '충전 금액을 숫자로 입력해 주세요.');
                                return;
                              }
                              setState(() => localError = null);
                              session.chargeWallet(parsed);
                              amount.clear();
                            },
                            child: const Text('+ 충전'),
                          ),
                        ],
                      ),
                      if (localError != null) ...[
                        const SizedBox(height: 8),
                        Text(localError!,
                            style: const TextStyle(
                                color: Colors.white, fontSize: 12)),
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
                  title: const Text('간편 송금 & 결제 보호',
                      style:
                          TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                  subtitle: Text('24시간 이상거래 탐지 FDS 및 종단간 암호화 적용',
                      style: Theme.of(context).textTheme.bodySmall),
                ),
              ),
              if (session.walletHistory.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text('최근 기록', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 4),
                for (final h in session.walletHistory)
                  ListTile(
                    dense: true,
                    title: Text("${h['title'] ?? h['kind'] ?? '거래'}",
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
