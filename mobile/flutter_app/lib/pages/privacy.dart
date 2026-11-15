// Route: /privacy — personal info protection. The ID-search toggle, the
// honest E2EE status, and the working signed-in device list. Reference
// rows without a backend (app lock, friends-only messages, QR rotation,
// third-party grants, data sharing) are omitted, never faked.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../theme/luno_theme.dart';
import '../util/app_l10n.dart';

class PrivacyPage extends StatefulWidget {
  const PrivacyPage({super.key});

  @override
  State<PrivacyPage> createState() => _PrivacyPageState();
}

class _PrivacyPageState extends State<PrivacyPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SessionScope.of(context, listen: false).loadDevices();
    });
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final searchable =
        session.myPrefs['searchable_by_id'] as bool? ?? true;
    final devices = session.devices.whereType<Map<String, dynamic>>().toList();
    return ListView(
      children: [
        PageColumn(
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: context.l10n.backWord,
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context.go('/settings'),
                ),
                Text(context.l10n.privacyTitle,
                    style: TextStyle(
                        fontSize: HarborType.title,
                        fontWeight: FontWeight.w700,
                        color: ink)),
              ],
            ),
            _ToggleRow(
              title: context.l10n.privacyIdAdd,
              description:
                  context.l10n.privacyIdAddDesc,
              value: searchable,
              enabled: session.prefsLoaded,
              ink: ink,
              sub: sub,
              onChanged: session.setSearchableById,
            ),
            const Divider(height: 1),
            _StatusRow(
              icon: Icons.lock_outline,
              title: context.l10n.privacyE2ee,
              subtitle: context.l10n.privacyE2eePreparing,
              ink: ink,
              sub: sub,
              dark: dark,
            ),
            Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(context.l10n.privacyDevices,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: sub)),
                  ),
                  IconButton(
                    tooltip: context.l10n.privacyDevicesRefresh,
                    icon: const Icon(Icons.refresh, size: 20),
                    onPressed: session.loadDevices,
                  ),
                ],
              ),
            ),
            if (devices.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(context.l10n.privacyNoDevices,
                    style: TextStyle(fontSize: 13, color: sub)),
              ),
            for (var i = 0; i < devices.length; i++) ...[
              if (i > 0) const Divider(height: 1),
              _DeviceRow(device: devices[i]),
            ],
          ],
        ),
      ],
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final String title;
  final String description;
  final bool value;
  final bool enabled;
  final Color ink;
  final Color sub;
  final ValueChanged<bool> onChanged;
  const _ToggleRow({
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

class _StatusRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color ink;
  final Color sub;
  final bool dark;
  const _StatusRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.ink,
    required this.sub,
    required this.dark,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Icon(icon,
              color:
                  dark ? HarborDark.harbor : HarborLight.harbor),
          const SizedBox(width: 12),
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
                Text(subtitle,
                    style: TextStyle(fontSize: 13, color: sub)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DeviceRow extends StatelessWidget {
  final Map<String, dynamic> device;
  const _DeviceRow({required this.device});

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context, listen: false);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ink = dark ? LunoDark.textPrimary : LunoLight.textPrimary;
    final sub = dark ? LunoDark.textSecondary : LunoLight.textSecondary;
    final current = device['current'] == true;
    final platform = device['platform']?.toString() ?? '';
    final ip = device['ip']?.toString() ?? '';
    final seen = session.relTime(device['last_seen_at']);
    final bits = [
      if (platform.isNotEmpty) platform,
      if (ip.isNotEmpty) ip,
      if (seen.isNotEmpty) context.l10n.privacyLastSeen(seen),
    ];
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Icon(Icons.devices,
              color:
                  dark ? HarborDark.harbor : HarborLight.harbor),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(device['name']?.toString() ?? context.l10n.privacyUnknownDevice,
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: ink)),
                if (bits.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(bits.join(' · '),
                      style: TextStyle(fontSize: HarborType.small, color: sub)),
                ],
              ],
            ),
          ),
          if (current)
            Text(context.l10n.privacyThisDevice,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: sub))
          else
            TextButton(
              onPressed: () => session.revokeDevice(
                  device['device_id']?.toString() ??
                      device['id']?.toString() ??
                      ''),
              child: Text(context.l10n.closeWord),
            ),
        ],
      ),
    );
  }
}
