// Route: /settings — engine room. Translation, QR approval, sealing, GDPR.
import 'package:flutter/material.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final qrChallenge = TextEditingController();
  final qrToken = TextEditingController();

  @override
  void dispose() {
    qrChallenge.dispose();
    qrToken.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final line = dark ? HarborDark.channel : HarborLight.channel;
    final surface = dark ? HarborDark.surface : Colors.white;
    return ListView(
      children: [
        PageColumn(
          children: [
            const Masthead(title: '설정', subtitle: '기관실 제어반'),
            Card(
              color: surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(color: line),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.translate,
                            color: dark
                                ? HarborDark.harbor
                                : HarborLight.harbor),
                        const SizedBox(width: 8),
                        Text('LUNO AI 실시간 번역 설정',
                            style: Theme.of(context).textTheme.titleMedium),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text('상대방의 외국어 메시지를 선택한 언어로 즉시 번역합니다.',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 10),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('새 메시지 자동 번역',
                          style: TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600)),
                      value: session.autoTranslate,
                      onChanged: (v) => SessionScope.of(context, listen: false)
                          .setAutoTranslate(v),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('기본 번역 대상 언어',
                            style: TextStyle(
                                fontSize: 13, fontWeight: FontWeight.w600)),
                        DropdownButton<String>(
                          value: session.targetTranslateLang,
                          underline: const SizedBox(),
                          items: const [
                            DropdownMenuItem(
                                value: 'ko', child: Text('한국어 (KO)')),
                            DropdownMenuItem(
                                value: 'en', child: Text('English (EN)')),
                            DropdownMenuItem(
                                value: 'th', child: Text('ไทย (TH)')),
                            DropdownMenuItem(
                                value: 'ja', child: Text('日本語 (JA)')),
                            DropdownMenuItem(
                                value: 'zh', child: Text('中文 (ZH)')),
                            DropdownMenuItem(
                                value: 'es', child: Text('Español (ES)')),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              SessionScope.of(context, listen: false)
                                  .setTargetTranslateLang(v);
                            }
                          },
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              color: surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(color: line),
              ),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.qr_code_scanner,
                            color: dark
                                ? HarborDark.harbor
                                : HarborLight.harbor),
                        const SizedBox(width: 8),
                        Text('PC/웹 데스크톱 QR 로그인 승인',
                            style: Theme.of(context).textTheme.titleMedium),
                      ],
                    ),
                    const SizedBox(height: 8),
                    TextField(
                        controller: qrChallenge,
                        decoration: const InputDecoration(
                            labelText: 'QR Challenge ID', isDense: true)),
                    const SizedBox(height: 6),
                    TextField(
                        controller: qrToken,
                        decoration: const InputDecoration(
                            labelText: 'QR Token', isDense: true)),
                    const SizedBox(height: 10),
                    FilledButton(
                      onPressed: () {
                        session.approveDesktopQR(
                            qrChallenge.text, qrToken.text);
                        qrChallenge.clear();
                        qrToken.clear();
                      },
                      child: const Text('데스크톱 승인 완료'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              color: surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(HarborRadius.card),
                side: BorderSide(color: line),
              ),
              child: Column(
                children: [
                  SwitchListTile(
                    title: const Text('Letter Sealing (종단간 E2EE)',
                        style: TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Text('Signal X3DH & Double Ratchet 암호화 활성화',
                        style: Theme.of(context).textTheme.bodySmall),
                    value: session.letterSealing,
                    onChanged: (v) => SessionScope.of(context, listen: false)
                        .setLetterSealing(v),
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: Icon(Icons.download,
                        color:
                            dark ? HarborDark.harbor : HarborLight.harbor),
                    title: const Text('GDPR 데이터 아카이브 다운로드',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700)),
                    subtitle: Text('내 모든 메시지, 친구, 미디어 메타데이터 내보내기',
                        style: Theme.of(context).textTheme.bodySmall),
                    onTap: session.exportGdprData,
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}
