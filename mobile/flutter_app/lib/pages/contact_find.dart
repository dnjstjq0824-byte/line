// Route: /contacts/find — find friends from the device address book.
// Consent first (recorded server-side), then the contacts permission, then
// results. Nothing uploads before consent; a 503 shows guidance only.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';
import '../util/app_permissions.dart';
import '../util/contact_source.dart';
import '../util/e164.dart';

class ContactFindPage extends StatefulWidget {
  final ContactSource? source;
  final PermissionGateway? gateway;

  /// Test seam: country code for domestic trunk numbers. Production derives
  /// it from the device region instead.
  final String? countryCode;
  const ContactFindPage({super.key, this.source, this.gateway, this.countryCode});

  @override
  State<ContactFindPage> createState() => _ContactFindPageState();
}

class _ContactFindPageState extends State<ContactFindPage> {
  bool _busy = false;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SessionScope.of(context, listen: false).loadContactConsent();
    });
  }

  Future<void> _agree() async {
    await SessionScope.of(context, listen: false).setContactConsent(true);
  }

  void _later() {
    Navigator.of(context).maybePop();
  }

  Future<void> _load() async {
    if (_busy) return;
    final ok = await withPermissions(
      context,
      permissions: [
        (Permission.contacts, context.l10n.contactPermTitle,
            context.l10n.contactPermDesc),
      ],
      gateway: widget.gateway,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      final src = widget.source ?? const DeviceContactSource();
      final entries = await src.readContacts();
      if (!mounted) return;
      final cc = widget.countryCode ?? regionCallingCode(Platform.localeName);
      final nums = <String>{};
      for (final e in entries) {
        for (final p in e.phones) {
          final v = toE164(p, countryCode: cc);
          if (v != null) nums.add(v);
        }
      }
      await SessionScope.of(context, listen: false)
          .findContacts(nums.toList());
      if (mounted) setState(() => _loaded = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = SessionScope.of(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          tooltip: context.l10n.backWord,
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: Text(context.l10n.contactFindTitle),
      ),
      body: PageColumn(
        children: [
          if (!session.contactConsentLoaded)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (!session.contactConsent) ...[
            const SizedBox(height: 24),
            Text(context.l10n.contactConsentTitle,
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text(context.l10n.contactConsentBody),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const ValueKey('contact-agree'),
                onPressed: _agree,
                child: Text(context.l10n.contactConsentAgree),
              ),
            ),
            TextButton(
              key: const ValueKey('contact-later'),
              onPressed: _later,
              child: Text(context.l10n.contactConsentLater),
            ),
          ] else ...[
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const ValueKey('contact-load'),
                onPressed: _busy ? null : _load,
                child: Text(context.l10n.contactLoad),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: session.contactUnavailable
                  ? Center(child: Text(context.l10n.contactUnavailable))
                  : !_loaded
                      ? Center(child: Text(context.l10n.contactFindHint))
                      : session.contactMatches.isEmpty
                          ? Center(
                              child: Text(context.l10n.contactFindEmpty))
                          : ListView(
                              children: [
                                for (final m in session.contactMatches)
                                  if (m is Map && m['user'] is Map)
                                    Card(
                                      color: dark
                                          ? HarborDark.surface
                                          : Colors.white,
                                      child: ListTile(
                                        title: Text(
                                            '${m['user']['display_name'] ?? ''}'),
                                        subtitle: Text(
                                            '@${m['user']['handle'] ?? ''}'),
                                        trailing: FilledButton.tonal(
                                          onPressed: () =>
                                              SessionScope.of(context,
                                                      listen: false)
                                                  .addFriend(
                                                      '${m['user']['id']}'),
                                          child:
                                              Text(context.l10n.mvAdd),
                                        ),
                                      ),
                                    ),
                              ],
                            ),
            ),
          ],
        ],
      ),
    );
  }
}
