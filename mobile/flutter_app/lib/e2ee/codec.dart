// E4: byte/string codecs. Must match apps/shared/e2ee/codec.ts exactly.
import 'dart:convert';
import 'dart:typed_data';

String b64uEncode(Uint8List bytes) =>
    base64Url.encode(bytes).replaceAll('=', '');

Uint8List b64uDecode(String s) {
  if (s.length > 1 << 20 || !RegExp(r'^[A-Za-z0-9_-]*$').hasMatch(s)) {
    throw StateError('bad b64u');
  }
  return base64Url.decode(base64.normalize(s));
}

Uint8List utf8Encode(String s) => Uint8List.fromList(utf8.encode(s));

String utf8Decode(Uint8List bytes) => utf8.decode(bytes);

bool u8eq(Uint8List a, Uint8List b) {
  if (a.length != b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) {
    d |= a[i] ^ b[i];
  }
  return d == 0;
}

Uint8List concatBytes(List<Uint8List> parts) {
  final out = Uint8List(parts.fold(0, (n, p) => n + p.length));
  var at = 0;
  for (final p in parts) {
    out.setRange(at, at + p.length, p);
    at += p.length;
  }
  return out;
}

Uint8List u32be(int n) {
  final out = Uint8List(4);
  ByteData.sublistView(out).setUint32(0, n, Endian.big);
  return out;
}

int u32beRead(Uint8List bytes, int at) =>
    ByteData.sublistView(bytes, at, at + 4).getUint32(0, Endian.big);
