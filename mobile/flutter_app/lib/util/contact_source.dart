// F26: device-contact reads behind a seam (widget tests script entries).
// Production reads names + phone numbers only; the caller gates the
// contacts permission first and converts with toE164 before uploading.
import 'package:flutter_contacts/flutter_contacts.dart';

class ContactEntry {
  final String name;
  final List<String> phones;
  const ContactEntry({required this.name, required this.phones});
}

abstract class ContactSource {
  const ContactSource();
  Future<List<ContactEntry>> readContacts();
}

class DeviceContactSource extends ContactSource {
  const DeviceContactSource();
  @override
  Future<List<ContactEntry>> readContacts() async {
    try {
      final all = await FlutterContacts.getAll(
          properties: {ContactProperty.name, ContactProperty.phone});
      return [
        for (final c in all)
          ContactEntry(name: c.displayName ?? '', phones: [
            for (final p in c.phones) p.normalizedNumber ?? p.number
          ]),
      ];
    } catch (_) {
      return [];
    }
  }
}
