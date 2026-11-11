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
                  tooltip: '뒤로',
                  icon: const Icon(Icons.arrow_back),
                  onPressed: () => context.go('/settings'),
                ),
                Text('개인 정보 보호',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                        color: ink)),
              ],
            ),
            _ToggleRow(
              title: 'ID로 친구 추가 허용',
              description:
                  '다른 사람이 내 ID를 검색하여 친구로 추가할 수 있습니다.',
              value: searchable,
              enabled: session.prefsLoaded,
              ink: ink,
              sub: sub,
              onChanged: session.setSearchableById,
            ),
            const Divider(height: 1),
            _StatusRow(
              icon: Icons.lock_outline,
              title: '종단간 암호화 (E2EE)',
              subtitle: '준비 중 — 현재 전송 구간 암호화(TLS)만 적용됩니다',
              ink: ink,
              sub: sub,
              dark: dark,
            ),
            Padding(
              padding: const EdgeInsets.only(top: 20, bottom: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text('로그인된 기기',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: sub)),
                  ),
                  IconButton(
                    tooltip: '기기 목록 새로고침',
                    icon: const Icon(Icons.refresh, size: 20),
                    onPressed: session.loadDevices,
                  ),
                ],
              ),
            ),
            if (devices.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('표시할 기기가 없습니다',
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
      if (seen.isNotEmpty) '최근 활동 $seen',
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
                Text(device['name']?.toString() ?? '알 수 없는 기기',
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: ink)),
                if (bits.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(bits.join(' · '),
                      style: TextStyle(fontSize: 12, color: sub)),
                ],
              ],
            ),
          ),
          if (current)
            Text('현재 기기',
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
              child: const Text('종료'),
            ),
        ],
      ),
    );
  }
}
