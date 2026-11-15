// F22: telemetry masking parity (same pinned cases as the worker and the
// shared TS spec) plus the error-report upload queue: local buffers survive
// a flush, errors flush at once, a throwing sender stays silent.
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/error_report.dart';
import 'package:luno_messenger/util/telemetry_mask.dart';

void main() {
  tearDown(resetTelemetryForTest);

  group('mask parity', () {
    test('secret keys are dropped', () {
      final out = maskTelemetryValue({
        'password': 'x',
        'Password': 'y',
        'user_password_hash': 'z',
        'code': '123456',
        'pin': '9999',
        'decode': 'keep',
      }) as Map;
      expect(out['password'], '[redacted]');
      expect(out['Password'], '[redacted]');
      expect(out['user_password_hash'], '[redacted]');
      expect(out['code'], '[redacted]');
      expect(out['pin'], '[redacted]');
      expect(out['decode'], 'keep');
    });

    test('bodies become lengths, emails dropped', () {
      final out = maskTelemetryValue({
        'body': 'hello',
        'text': 't',
        'message': 'm',
        'content': 'c',
        'bio': 'b',
        'tbody': 'kept-as-value',
        'email': 'a@b.co',
        'mail': 'kept',
      }) as Map;
      expect(out['body'], '[text len=5]');
      expect(out['text'], '[text len=1]');
      expect(out['message'], '[text len=1]');
      expect(out['tbody'], 'kept-as-value');
      expect(out['email'], '[email]');
      expect(out['mail'], 'kept');
    });

    test('envelope patterns are scrubbed', () {
      expect(maskEnvelopeText('Bearer abcDEF123._-~+/== tail'),
          'Bearer [redacted] tail');
      expect(maskEnvelopeText('x cf-token-9f8e7d6c-aaaa y'), 'x [token] y');
      expect(maskEnvelopeText('x cf-refresh-1234abcd y'), 'x [token] y');
      expect(
          maskEnvelopeText(
              'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'),
          '[jwt]');
      expect(
          maskEnvelopeText(
              '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----'),
          '[private-key]');
      expect(maskEnvelopeText('plain text untouched 123'),
          'plain text untouched 123');
    });

    test('nesting, sdp, auth headers', () {
      final out = maskTelemetryValue({
        'nested': {
          'deep': {
            'token': 'T',
            'list': [
              {'body': 'secret chat'},
              7,
              null
            ]
          }
        },
        'sdp': 'v=0',
        'authorization': 'Bearer zzz',
        'cookie': 'sid=1',
        'otp': '424242',
        'count': 3,
        'flag': true,
      }) as Map;
      final deep = (out['nested'] as Map)['deep'] as Map;
      expect(deep['token'], '[redacted]');
      expect(((deep['list'] as List)[0] as Map)['body'], '[text len=11]');
      expect((deep['list'] as List)[1], 7);
      expect(out['sdp'], '[redacted]');
      expect(out['authorization'], '[redacted]');
      expect(out['cookie'], '[redacted]');
      expect(out['otp'], '[redacted]');
      expect(out['count'], 3);
      expect(out['flag'], true);
    });
  });

  group('report queue', () {
    test('reportError masks and buffers locally', () {
      final report = reportError(
          Exception('boom Bearer abc123'), {'password': 'pw', 'op': 'GET /x'});
      expect(report.message, 'Exception: boom Bearer [redacted]');
      expect(report.context!['password'], '[redacted]');
      expect(report.context!['op'], 'GET /x');
      expect(recentErrors(), hasLength(1));
    });

    test('sender flush keeps the local view', () async {
      List<AppErrorReport> sentErrors = const [];
      List<AppPerfSample> sentPerf = const [];
      setTelemetrySender(({required errors, required perf}) async {
        sentErrors = errors;
        sentPerf = perf;
      });
      recordPerf('GET /api/v1/chats', 12);
      reportError(Exception('kablam'));
      // Errors flush at once; the periodic timer is not involved.
      await Future<void>.delayed(Duration.zero);
      expect(sentErrors, hasLength(1));
      expect(sentPerf, hasLength(1));
      expect(sentPerf.single.ms, 12);
      expect(recentErrors(), hasLength(1),
          reason: 'flush must not empty the local view');
      expect(recentPerf(), hasLength(1));
      // A second flush sends nothing new.
      sentErrors = const [];
      await flushTelemetry();
      expect(sentErrors, isEmpty);
    });

    test('a throwing sender stays silent and keeps local data', () async {
      setTelemetrySender(({required errors, required perf}) async {
        throw StateError('uploader down');
      });
      reportError(Exception('still recorded'));
      await Future<void>.delayed(Duration.zero);
      expect(recentErrors(), hasLength(1));
    });

    test('negative perf samples are dropped', () {
      recordPerf('bad', -1);
      expect(recentPerf(), isEmpty);
    });

    test('report json carries masked fields only', () {
      final report = reportError(
          Exception('Bearer abc123'), {'email': 'a@b.co'});
      final json = report.toJson();
      expect(json['message'], isNot(contains('abc123')));
      expect((json['context'] as Map)['email'], '[email]');
      expect(json['at'], isNotEmpty);
    });
  });
}
