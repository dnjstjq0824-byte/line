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
import '../util/app_l10n.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final name = session.selfName.isEmpty ? context.l10n.myProfile : session.selfName;
    final status = session.selfStatusMessage.isEmpty
        ? context.l10n.profileUnset
        : session.selfStatusMessage;
    final searchable =
        session.myPrefs['searchable_by_id'] as bool? ?? true;
    final linkPreviews =
        session.myPrefs['link_previews'] as bool? ?? true;
    return ListView(
      children: [
        PageColumn(
          children: [
            Masthead(title: context.l10n.settingsTitle),
            _ProfileRow(
                name: name, status: status, ink: ink, sub: sub, dark: dark),
            _Section(
              title: context.l10n.settingsPrivacy,
              sub: sub,
              children: [
                _ToggleRow(
                  switchKey: const ValueKey('id-search-toggle'),
                  title: context.l10n.privacyIdAdd,
                  description:
                      context.l10n.privacyIdAddDesc,
                  value: searchable,
                  enabled: session.prefsLoaded,
                  ink: ink,
                  sub: sub,
                  onChanged: session.setSearchableById,
                ),
                const _RowDivider(),
                _ToggleRow(
                  switchKey: const ValueKey('link-preview-toggle'),
                  title: context.l10n.settingsLinkPreview,
                  description: context.l10n.settingsLinkPreviewDesc,
                  value: linkPreviews,
                  enabled: session.prefsLoaded,
                  ink: ink,
                  sub: sub,
                  onChanged: session.setLinkPreviews,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.download,
                  title: context.l10n.settingsExport,
                  subtitle: context.l10n.settingsExportDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  onTap: session.exportGdprData,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.privacy_tip_outlined,
                  title: context.l10n.privacyTitle,
                  subtitle: context.l10n.settingsPrivacyDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => context.go('/privacy'),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.shield_outlined,
                  title: context.l10n.reportHistoryTitle,
                  subtitle: context.l10n.settingsReportsDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => context.go('/reports'),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.support_agent,
                  title: context.l10n.supportTitle,
                  subtitle: context.l10n.settingsSupportDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => context.go('/support'),
                ),
              ],
            ),
            _Section(
              title: context.l10n.navChats,
              sub: sub,
              children: [
                _ToggleRow(
                  switchKey: const ValueKey('notify-toggle'),
                  title: context.l10n.settingsNotify,
                  description: context.l10n.settingsNotifyDesc,
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
                      permissions: [
                        (Permission.notification, context.l10n.settingsNotifyPerm,
                            context.l10n.settingsNotifyPermDesc),
                      ],
                      action: () async => ctl.setNotifyEnabled(true),
                    );
                  },
                ),
                const _RowDivider(),
                _ToggleRow(
                  switchKey: const ValueKey('auto-translate-toggle'),
                  title: context.l10n.settingsAutoTranslate,
                  description:
                      context.l10n.settingsTranslatePreparing,
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
                  title: context.l10n.settingsTargetLang,
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
                                  child: Text(_translateLangLabel(lang, session.locale))),
                          ],
                          onChanged: (v) {
                            if (v != null) {
                              SessionScope.of(context, listen: false)
                                  .setTargetTranslateLang(v);
                            }
                          },
                        )
                      : Text(context.l10n.translatePreparing,
                          style: TextStyle(fontSize: 13, color: sub)),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.language,
                  title: context.l10n.settingsLanguage,
                  subtitle: context.l10n.settingsLanguageDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  trailing: DropdownButton<String>(
                    value: session.locale,
                    underline: const SizedBox(),
                    items: [
                      for (final code in appLocaleCodes)
                        DropdownMenuItem(
                            value: code,
                            child: Text(appLocaleNames[code] ?? code)),
                    ],
                    onChanged: (v) {
                      if (v != null) {
                        SessionScope.of(context, listen: false).setLocale(v);
                      }
                    },
                  ),
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.lock_outline,
                  title: context.l10n.privacyE2ee,
                  subtitle: context.l10n.privacyE2eePreparing,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                ),
              ],
            ),
            _Section(
              title: context.l10n.deviceWord,
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.qr_code_scanner,
                  title: context.l10n.settingsQrApprove,
                  subtitle: context.l10n.settingsQrApproveDesc,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  chevron: true,
                  onTap: () => _qrDialog(context),
                ),
              ],
            ),
            _Section(
              title: context.l10n.settingsAppInfo,
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.system_update,
                  title: context.l10n.settingsAppUpdate,
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
              title: context.l10n.accountWord,
              sub: sub,
              children: [
                _ActionRow(
                  icon: Icons.logout,
                  title: context.l10n.mvLogout,
                  ink: ink,
                  sub: sub,
                  dark: dark,
                  onTap: session.logout,
                ),
                const _RowDivider(),
                _ActionRow(
                  icon: Icons.delete_forever_outlined,
                  title: context.l10n.settingsDeleteAccount,
                  subtitle: context.l10n.settingsDeleteWarn,
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
      return stringsFor(session.locale).appUpdateRequired(session.latestAppVersion);
    case UpdateKind.optional:
      return stringsFor(session.locale).appUpdateAvailable(session.latestAppVersion);
    case UpdateKind.none:
      if (session.latestAppVersion.isEmpty) return stringsFor(session.locale).settingsCheckUpdate;
      return stringsFor(session.locale).appUpToDate(session.currentAppVersion);
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
      borderRadius: BorderRadius.circular(HarborRadius.card),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
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
    // Grouped card per section (LINE/web settings style): the title sits
    // above, the rows live inside one rounded surface.
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 6),
            child: Text(title,
                style: TextStyle(
                    fontSize: HarborType.small,
                    fontWeight: FontWeight.w700,
                    color: sub)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: dark ? HarborDark.surface : Colors.white,
              borderRadius: BorderRadius.circular(HarborRadius.card),
              border: Border.all(color: dark ? HarborDark.channel : HarborLight.channel),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: children,
            ),
          ),
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
        title: Text(context.l10n.settingsQrApprove),
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
              child: Text(context.l10n.mvCancel)),
          TextButton(
              onPressed: () {
                Navigator.of(dialog).pop();
                context.go('/qr/scan');
              },
              child: Text(context.l10n.homeScanCamera)),
          FilledButton(
            onPressed: () {
              session.approveDesktopQR(challenge.text, token.text);
              Navigator.of(dialog).pop();
            },
            child: Text(context.l10n.settingsDesktopApproved),
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
              title: Text(context.l10n.settingsDeleteConfirm),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n.settingsDeleteGrace),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    obscureText: true,
                    decoration: InputDecoration(
                        labelText: context.l10n.settingsPwConfirm, isDense: true),
                  ),
                  SizedBox(height: 8),
                  TextField(
                    controller: confirm,
                    decoration: InputDecoration(
                        labelText: context.l10n.mvDeleteConfirmAria, isDense: true),
                  ),
                  SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: reason.isEmpty ? null : reason,
                    hint: Text(context.l10n.settingsDeleteReason),
                    items: [
                      DropdownMenuItem(value: 'not_using', child: Text(context.l10n.mvDeleteReasonNotUsing)),
                      DropdownMenuItem(value: 'privacy', child: Text(context.l10n.mvDeleteReasonPrivacy)),
                      DropdownMenuItem(value: 'hard_to_use', child: Text(context.l10n.mvDeleteReasonHardToUse)),
                      DropdownMenuItem(value: 'other', child: Text(context.l10n.mvDeleteReasonOther)),
                    ],
                    onChanged: (v) => setState(() => reason = v ?? ''),
                  ),
                ],
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: Text(context.l10n.mvCancel)),
                FilledButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: Text(context.l10n.settingsScheduleDelete)),
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
String _translateLangLabel(String code, [String locale = 'ko']) {
  final s = stringsFor(locale);
  return {
    'ko': s.settingsLangKo,
    'en': s.settingsLangEn,
    'th': s.settingsLangTh,
    'ja': s.settingsLangJa,
    'zh': s.settingsLangZh,
    'es': s.settingsLangEs,
  }[code] ??
      code.toUpperCase();
}
