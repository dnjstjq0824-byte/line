// E4: ciphertext envelopes. Mirrors apps/shared/e2ee/envelope.ts.
import 'dart:convert';

import 'codec.dart';
import 'keys.dart';

abstract class CipherEnvelope {
  String get type;
}

class PrekeyEnvelope implements CipherEnvelope {
  @override
  String get type => 'prekey';
  final String ik;
  final String ek;
  final int? spkId;
  final String? opkId;
  final String? spk;
  final String header;
  final String iv;
  final String ct;
  const PrekeyEnvelope({required this.ik, required this.ek, required this.spkId, required this.opkId, this.spk, required this.header, required this.iv, required this.ct});
}

class MsgEnvelope implements CipherEnvelope {
  @override
  String get type => 'msg';
  final String header;
  final String iv;
  final String ct;
  const MsgEnvelope({required this.header, required this.iv, required this.ct});
}

class SkDistEnvelope implements CipherEnvelope {
  @override
  String get type => 'sk';
  final String room;
  final int gen;
  final String chain;
  final String signPub;
  const SkDistEnvelope({required this.room, required this.gen, required this.chain, required this.signPub});
}

CipherEnvelope decodeEnvelope(String s) {
  final o = jsonDecode(s) as Map<String, dynamic>;
  if (o['v'] != 1) throw StateError('unsupported envelope version');
  if (o['type'] == 'prekey') {
    for (final k in ['ik', 'ek', 'header', 'iv', 'ct']) {
      if (o[k] is! String || (o[k] as String).isEmpty) throw StateError('bad prekey envelope');
    }
    if (parseIdentity(o['ik'] as String) == null) throw StateError('bad prekey envelope');
    for (final k in ['ek', 'header', 'iv', 'ct']) {
      b64uDecode(o[k] as String);
    }
    if (o['spk'] != null) {
      if (o['spk'] is! String || (o['spk'] as String).isEmpty) throw StateError('bad prekey envelope');
      b64uDecode(o['spk'] as String);
    }
    return PrekeyEnvelope(
      ik: o['ik'] as String, ek: o['ek'] as String,
      spkId: o['spkId'] as int?, opkId: o['opkId'] as String?, spk: o['spk'] as String?,
      header: o['header'] as String, iv: o['iv'] as String, ct: o['ct'] as String,
    );
  }
  if (o['type'] == 'msg') {
    for (final k in ['header', 'iv', 'ct']) {
      if (o[k] is! String || (o[k] as String).isEmpty) throw StateError('bad msg envelope');
    }
    for (final k in ['header', 'iv', 'ct']) {
      b64uDecode(o[k] as String);
    }
    return MsgEnvelope(header: o['header'] as String, iv: o['iv'] as String, ct: o['ct'] as String);
  }
  if (o['type'] == 'sk') {
    if (o['room'] is! String || (o['room'] as String).isEmpty || o['gen'] is! int) {
      throw StateError('bad sk envelope');
    }
    for (final k in ['chain', 'signPub']) {
      if (o[k] is! String || (o[k] as String).isEmpty) throw StateError('bad sk envelope');
    }
    b64uDecode(o['chain'] as String);
    b64uDecode(o['signPub'] as String);
    return SkDistEnvelope(
        room: o['room'] as String, gen: o['gen'] as int, chain: o['chain'] as String, signPub: o['signPub'] as String);
  }
  throw StateError('unknown envelope type');
}
