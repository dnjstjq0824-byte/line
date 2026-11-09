// Smart-channel slot: the single notice card at the top of the talk list.
//
// The server serves curated LUNO announcements only (GET /api/v1/channel/slot,
// {slot: {id, title, body} | null}). Anything misshapen parses to null so the
// list renders without a card instead of showing a broken one.
import 'package:flutter/material.dart';

class ChannelSlot {
  final String id;
  final String title;
  final String body;
  const ChannelSlot({required this.id, required this.title, required this.body});
}

ChannelSlot? channelSlotOf(dynamic json) {
  final slot = json is Map ? json['slot'] : null;
  if (slot is! Map) return null;
  final id = slot['id'];
  final title = slot['title'];
  final body = slot['body'];
  if (id is! String ||
      id.isEmpty ||
      title is! String ||
      title.isEmpty ||
      body is! String ||
      body.isEmpty) {
    return null;
  }
  return ChannelSlot(id: id, title: title, body: body);
}

/// Notice card with a session-local dismiss button.
class ChannelSlotCard extends StatelessWidget {
  final ChannelSlot slot;
  final bool dark;
  final VoidCallback onDismiss;
  const ChannelSlotCard(
      {super.key, required this.slot, required this.dark, required this.onDismiss});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: dark ? const Color(0xFF1B2A4A) : const Color(0xFFEAF1FF),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            const Icon(Icons.campaign_outlined, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(slot.title,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(slot.body,
                      style: const TextStyle(fontSize: 12, height: 1.4)),
                ],
              ),
            ),
            IconButton(
              tooltip: '닫기',
              icon: const Icon(Icons.close, size: 18),
              onPressed: onDismiss,
            ),
          ],
        ),
      ),
    );
  }
}
