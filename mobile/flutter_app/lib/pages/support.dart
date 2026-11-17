// Route: /support — customer support: file an inquiry (category, body,
// app version auto-attached) and read my tickets with admin answers.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../design/responsive.dart';
import '../design/v3.dart';
import '../state/session.dart';
import '../util/app_l10n.dart';

/// Server ticket categories (SUPPORT_TICKET_CATEGORIES on the worker).
const supportTicketCategories = ['account', 'chat', 'payment', 'bug', 'other'];

class SupportPage extends StatefulWidget {
  const SupportPage({super.key});

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  String _category = 'bug';
  final _body = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      SessionScope.of(context, listen: false).loadSupportTickets();
    });
  }

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  String _categoryLabel(String category) {
    switch (category) {
      case 'account':
        return context.l10n.supportCatAccount;
      case 'chat':
        return context.l10n.supportCatChat;
      case 'payment':
        return context.l10n.supportCatPayment;
      case 'bug':
        return context.l10n.supportCatBug;
      default:
        return context.l10n.supportCatOther;
    }
  }

  String _statusLabel(String status) {
    return status == 'answered'
        ? context.l10n.supportStateAnswered
        : context.l10n.supportStateOpen;
  }

  Future<void> _submit() async {
    final text = _body.text.trim();
    if (text.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await SessionScope.of(context, listen: false)
          .fileSupportTicket(_category, text);
      _body.clear();
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
        title: Text(context.l10n.supportTitle),
      ),
      body: PageColumn(
        children: [
          Row(
            children: [
              Text(context.l10n.supportCategory),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButton<String>(
                  key: const ValueKey('support-category'),
                  value: _category,
                  isExpanded: true,
                  items: [
                    for (final c in supportTicketCategories)
                      DropdownMenuItem(
                          value: c, child: Text(_categoryLabel(c))),
                  ],
                  onChanged: (v) {
                    if (v != null) setState(() => _category = v);
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            key: const ValueKey('support-body'),
            controller: _body,
            maxLines: 3,
            decoration:
                InputDecoration(hintText: context.l10n.supportBodyPh),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('support-submit'),
              onPressed: _busy ? null : _submit,
              child: Text(context.l10n.supportSubmit),
            ),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: Text(context.l10n.supportHistoryTitle,
                style: const TextStyle(fontWeight: FontWeight.w700)),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: session.supportTickets.isEmpty
                ? Center(child: Text(context.l10n.supportHistoryEmpty))
                : ListView(
                    children: [
                      for (final t in session.supportTickets)
                        if (t is Map)
                          Card(
                            color:
                                dark ? HarborDark.surface : Colors.white,
                            child: ListTile(
                              title: Text(_categoryLabel(
                                  '${t['category']}')),
                              subtitle: Text(
                                  '${t['body'] ?? ''}\n${_statusLabel('${t['status']}')}${(t['answer'] ?? '').toString().isEmpty ? '' : '\n${t['answer']}'}'),
                              isThreeLine: true,
                            ),
                          ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
