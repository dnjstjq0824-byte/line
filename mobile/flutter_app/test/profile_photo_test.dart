import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/pages/profile.dart';

// F5: avatar/cover arrive as an R2 serving path, an absolute URL, or a
// legacy inline data: URL; anything else falls back to the glyph avatar.
void main() {
  const base = 'https://api.example.test';

  test('relative serving path resolves against the api base', () {
    final img = profilePhotoImage(base, '/api/v1/users/u1/avatar');
    expect(img, isA<NetworkImage>());
    expect((img as NetworkImage).url, '$base/api/v1/users/u1/avatar');
  });

  test('absolute url passes through', () {
    final img = profilePhotoImage(base, 'https://cdn.example.test/p.png');
    expect(img, isA<NetworkImage>());
    expect((img as NetworkImage).url, 'https://cdn.example.test/p.png');
  });

  test('legacy data url decodes to memory', () {
    final img = profilePhotoImage(
        base, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEA');
    expect(img, isA<MemoryImage>());
  });

  test('empty or unknown values fall back to null', () {
    expect(profilePhotoImage(base, ''), isNull);
    expect(profilePhotoImage(base, 'not-a-photo'), isNull);
    expect(profilePhotoImage(base, 'data:image/png;base64,!!!'), isNull);
  });
}
