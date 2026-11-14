// Route: /settings — LINE-style grouped list over real LUNO actions only.
// Profile row, personal info, chat, device, and account sections. Every row
// either navigates to a working page, edits a real (server or local)
// setting, or opens a working dialog. Rows without a backend (account move,
// chat backup, shop, watch) are omitted rather than faked.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/app_permissions.dart';
import '../util/app_update.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final name = session.selfName.isEmpty ? '내 프로필' : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? '설정 안 함'
        : session.selfStatusMessage;
    final searchable =
        session.myPrefs['searchable_by_id'] as bool? ?? true;
    final linkPreviews =
        session.myPrefs['link_previews'] as bool? ?? true;
    return ListView(
      children: [
        PageColumn(
          children: [
            const Masthead(title: '설정'),
            _ProfileRow(
                name: name, status: status, ink: ink, sub: sub, dark: dark),
            _Section(
              title: '개인 정보',
              sub: sub,
              children: [
                _ToggleRow(
                  switchKey: const ValueKey('id-search-toggle'),
                  title: 'ID로 친구 추가 허용',
                  description:
                      '다른 사람이 내 ID를 검색하여 친구로 추가할 수 있습니다.',
                  value: searchable,
                  enabled: session.prefsLoaded,
                  ink: ink,
                  sub: sub,
                  onChanged: session.setSearchableById,
                ),
                const _RowDivider(),
                _ToggleRow(
                  switchKey: const ValueKey('link-preview-toggle'),
                  title: '링크 미리보기',
                  description: '대화의 https 링크 아래에 제목·설명·이미지를 보여줍니다.',
                  value: linkPreviews,
                  enabled: session.prefsLoaded,
                  ink: ink,
                  sub: sub,
                  onChanged: session.setLinkPreviews,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.download,
                  title: '데이터 내보내기',
                  subtitle: '대화·친구·미디어 메타데이터 (GDPR)',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  onTap: session.exportGdprData,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.privacy_tip_outlined,
                  title: '개인 정보 보호',
                  subtitle: 'ID 검색 허용·로그인 기기 관리',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => context.go('/privacy'),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.shield_outlined,
                  title: '내 신고 내역',
                  subtitle: '접수한 신고와 처리 상태',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => context.go('/reports'),
                ),
              ],
            ),
            _Section(
              title: '대화',
              sub: sub,
              children: [
                _ToggleRow(
                  switchKey: const ValueKey('notify-toggle'),
                  title: '새 메시지·전화 알림',
                  description: '앱이 백그라운드에 있을 때만 울립니다.',
                  value: session.notifyEnabled,
                  enabled: true,
                  ink: ink,
                  sub: sub,
                  onChanged: (v) {
                    final ctl =
                        SessionScope.of(context, listen: false);
                    if (!v) {
                      ctl.setNotifyEnabled(false);
                      return;
                    }
                    withPermissions(
                      context,
                      permissions: const [
                        (Permission.notification, '알림 권한 필요',
                            '새 메시지와 수신 전화를 알려주는 데 사용합니다.'),
                      ],
                      action: () async => ctl.setNotifyEnabled(true),
                    );
                  },
                ),
                const _RowDivider(),
                _ToggleRow(
                  switchKey: const ValueKey('auto-translate-toggle'),
                  title: '새 메시지 자동 번역',
                  description:
                      '준비 중 — 번역 엔진 연결 전까지 켜도 번역되지 않습니다.',
                  value: session.autoTranslate,
                  enabled: true,
                  ink: ink,
                  sub: sub,
                  onChanged: (v) => SessionScope.of(context, listen: false)
                      .setAutoTranslate(v),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.translate,
                  title: '번역 대상 언어',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  trailing: session.translateConfigured
                      ? DropdownButton<String>(
                          value: session.translateLanguages
                                  .contains(session.targetTranslateLang)
                              ? session.targetTranslateLang
                              : null,
                          underline: const SizedBox(),
                          items: [
                            for (final lang in session.translateLanguages)
                              DropdownMenuItem(
                                  value: lang,
                                  child: Text(_translateLangLabel(lang))),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              SessionScope.of(context, listen: false)
                                  .setTargetTranslateLang(v);
                            }
                          },
                        )
                      : Text('번역 준비 중',
                          style: TextStyle(fontSize: 13, color: sub)),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.lock_outline,
                  title: '종단간 암호화 (E2EE)',
                  subtitle: '준비 중 — 현재 전송 구간 암호화(TLS)만 적용됩니다',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                ),
              ],
            ),
            _Section(
              title: '기기',
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.qr_code_scanner,
                  title: '데스크톱 QR 로그인 승인',
                  subtitle: 'PC/웹 QR 챌린지를 승인합니다',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => _qrDialog(context),
                ),
              ],
            ),
            _Section(
              title: '앱 정보',
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.system_update,
                  title: '앱 업데이트',
                  subtitle: _updateSubtitle(session),
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  danger: session.appUpdate == UpdateKind.force,
                  chevron: true,
                  onTap: session.checkForUpdate,
                ),
              ],
            ),
            _Section(
              title: '계정',
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.logout,
                  title: '로그아웃',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  onTap: session.logout,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.delete_forever_outlined,
                  title: '계정 탈퇴',
                  subtitle: '모든 메시지·친구·미디어가 영구 삭제됩니다',
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  danger: true,
                  chevron: true,
                  onTap: () => _confirmDeleteAccount(context, session),
                ),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

String _updateSubtitle(SessionController session) {
  switch (session.appUpdate) {
    case UpdateKind.force:
      return '필수 업데이트가 있습니다 (${session.latestAppVersion})';
    case UpdateKind.optional:
      return '새 버전 ${session.latestAppVersion} 사용 가능';
    case UpdateKind.none:
      if (session.latestAppVersion.isEmpty) return '탭하여 새 버전 확인';
      return '최신 버전입니다 (${session.currentAppVersion})';
  }
}

class _ProfileRow extends StatelessWidget {
  final String name;
  final String status;
  final Color ink;
  final Color sub;
  final bool dark;
  const _ProfileRow({
    required this.name,
    required this.status,
    required this.ink,
    required this.sub,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () => context.go('/profile'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            LineAvatar(
              glyph: name,
              color: dark ? HarborDark.harbor : LunoBrand.deep,
              size: 48,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name,
                      style: TextStyle(
                          fontSize: HarborType.title,
                          fontWeight: FontWeight.w600,
                          color: ink)),
                  const SizedBox(height: 2),
                  Text(status,
                      style: TextStyle(fontSize: 13, color: sub)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: sub),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final Color sub;
  final List<Widget> children;
  const _Section(
      {required this.title, required this.sub, required this.children});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: sub)),
          const SizedBox(height: 4),
          ...children,
        ],
      ),
    );
  }
}

class _RowDivider extends StatelessWidget {
  const _RowDivider();

  @override
  Widget build(BuildContext context) => const Divider(height: 1);
}

class _ActionRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final Color ink;
  final Color sub;
  final bool dark;
  final bool danger;
  final bool chevron;
  final Widget? trailing;
  final VoidCallback? onTap;
  const _ActionRow({
    required this.icon,
    required this.title,
    required this.ink,
    required this.sub,
    required this.dark,
    this.subtitle,
    this.danger = false,
    this.chevron = false,
    this.trailing,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final dangerColor = dark ? HarborDark.danger : HarborLight.danger;
    final titleColor = danger ? dangerColor : ink;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            Icon(icon,
                color: danger
                    ? dangerColor
                    : (dark ? HarborDark.harbor : HarborLight.harbor)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: titleColor)),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle!,
                        style: TextStyle(fontSize: 13, color: sub)),
                  ],
                ],
              ),
            ),
            trailing ??
                (chevron && onTap != null
                    ? Icon(Icons.chevron_right, color: sub)
                    : const SizedBox.shrink()),
          ],
        ),
      ),
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final Key switchKey;
  final String title;
  final String description;
  final bool value;
  final bool enabled;
  final Color ink;
  final Color sub;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({
    required this.switchKey,
    required this.title,
    required this.description,
    required this.value,
    required this.enabled,
    required this.ink,
    required this.sub,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: ink)),
                const SizedBox(height: 2),
                Text(description,
                    style: TextStyle(fontSize: 13, color: sub)),
              ],
            ),
          ),
          Switch(
            key: switchKey,
            value: value,
            onChanged: enabled ? onChanged : null,
            activeThumbColor:
                dark ? LunoDark.primary : LunoLight.primary,
          ),
        ],
      ),
    );
  }
}

Future<void> _qrDialog(BuildContext context) async {
  final session = SessionScope.of(context, listen: false);
  final challenge = TextEditingController();
  final token = TextEditingController();
  // No synchronous dispose: the pop transition still touches these while
  // the session notify rebuilds. Unmount unregisters; GC collects.
  await showDialog<void>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('데스크톱 QR 로그인 승인'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: challenge,
                decoration: const InputDecoration(
                    labelText: 'QR Challenge ID', isDense: true)),
            const SizedBox(height: 6),
            TextField(
                controller: token,
                decoration: const InputDecoration(
                    labelText: 'QR Token', isDense: true)),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: const Text('취소')),
          TextButton(
              onPressed: () {
                Navigator.of(dialog).pop();
                context.go('/qr/scan');
              },
              child: const Text('카메라로 스캔')),
          FilledButton(
            onPressed: () {
              session.approveDesktopQR(challenge.text, token.text);
              Navigator.of(dialog).pop();
            },
            child: const Text('데스크톱 승인 완료'),
          ),
        ],
      ),
    );
}

Future<void> _confirmDeleteAccount(
    BuildContext context, SessionController session) async {
  final password = TextEditingController();
  final confirm = TextEditingController();
  String reason = '';
  // No synchronous dispose: the pop transition still touches this while
  // the session notify rebuilds. Unmount unregisters; GC collects.
  final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
            builder: (ctx, setState) => AlertDialog(
              title: const Text('계정을 삭제할까요?'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('30일의 유예 뒤 모든 데이터가 삭제됩니다. 유예 안에 로그인하면 복구됩니다. 계속하려면 비밀번호와 이메일을 입력하세요.'),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: '비밀번호 확인', isDense: true),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: confirm,
                    decoration: const InputDecoration(
                        labelText: '확인 이메일 입력', isDense: true),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: reason.isEmpty ? null : reason,
                    hint: const Text('탈퇴 사유 (선택)'),
                    items: const [
                      DropdownMenuItem(value: 'not_using', child: Text('사용하지 않음')),
                      DropdownMenuItem(value: 'privacy', child: Text('개인정보 우려')),
                      DropdownMenuItem(value: 'hard_to_use', child: Text('사용하기 어려움')),
                      DropdownMenuItem(value: 'other', child: Text('기타')),
                    ],
                    onChanged: (v) => setState(() => reason = v ?? ''),
                  ),
                ],
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: const Text('취소')),
                FilledButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: const Text('삭제 예약')),
              ],
            ),
          ));
    if (confirmed == true &&
        password.text.isNotEmpty &&
        confirm.text.isNotEmpty) {
      await session.deleteAccount(password.text,
          reason: reason, confirmText: confirm.text);
    }
}

// T1: server language codes get a short native label; unknown codes fall
// back to the upper-cased code so a future engine never renders blank.
String _translateLangLabel(String code) {
  return const {
    'ko': '한국어 (KO)',
    'en': 'English (EN)',
    'th': 'ไทย (TH)',
    'ja': '日本語 (JA)',
    'zh': '中文 (ZH)',
    'es': 'Español (ES)',
  }[code] ??
      code.toUpperCase();
}
