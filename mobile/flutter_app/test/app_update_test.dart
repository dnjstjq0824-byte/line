// C3: update advisory compares the installed build against /api/v1/app/latest.
// Major drift forces, any other newer component suggests, equal/older/garbage
// stays silent.
import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/app_update.dart';

class FakeHttp extends http.BaseClient {
  Future<http.Response> Function(http.BaseRequest request, String body)? handler;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final body = await request.finalize().transform(utf8.decoder).join();
    final res = await handler!(request, body);
    return http.StreamedResponse(
      Stream.value(utf8.encode(res.body)),
      res.statusCode,
      headers: {'content-type': 'application/json'},
    );
  }
}

http.Response jsonRes(Object body, int status) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json'},
    );

void mockPackageInfo({required String version, required String buildNumber}) {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dev.fluttercommunity.plus/package_info');
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, (call) async {
    if (call.method == 'getAll') {
      return <String, dynamic>{
        'appName': 'LUNO',
        'packageName': 'com.lunotalk.messenger',
        'version': version,
        'buildNumber': buildNumber,
      };
    }
    return null;
  });
}

void main() {
  group('compareAppVersions', () {
    test('prod combos', () {
      expect(compareAppVersions('2.0.0+8', '2.0.0+9'), UpdateKind.optional);
      expect(compareAppVersions('2.0.0+8', '2.1.0+1'), UpdateKind.optional);
      expect(compareAppVersions('2.0.0+8', '2.0.1+1'), UpdateKind.optional);
      expect(compareAppVersions('2.0.0+8', '3.0.0+1'), UpdateKind.force);
      expect(compareAppVersions('2.0.0+9', '2.0.0+8'), UpdateKind.none);
      expect(compareAppVersions('2.0.0+8', '2.0.0+8'), UpdateKind.none);
    });

    test('dev combos', () {
      expect(compareAppVersions('2.0.0-dev+3', '2.0.0+8'), UpdateKind.optional);
      expect(compareAppVersions('2.0.0-dev+3', '2.0.0-dev+3'), UpdateKind.none);
      expect(compareAppVersions('2.1.0-dev+1', '2.0.0+8'), UpdateKind.none);
    });

    test('garbage stays silent', () {
      expect(compareAppVersions('garbage', '2.0.0+8'), UpdateKind.none);
      expect(compareAppVersions('2.0.0+8', 'garbage'), UpdateKind.none);
      expect(compareAppVersions('', ''), UpdateKind.none);
      expect(compareAppVersions('2.0', '2.0.0+8'), UpdateKind.none);
    });
  });

  group('checkForUpdate', () {
    test('newer build stages an optional advisory', () async {
      mockPackageInfo(version: '2.0.0', buildNumber: '8');
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes(
          {'platform': 'android', 'version': '2.0.0', 'build': 9}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);

      await s.checkForUpdate();

      expect(s.appUpdate, UpdateKind.optional);
      expect(s.currentAppVersion, '2.0.0+8');
      expect(s.latestAppVersion, '2.0.0+9');
    });

    test('newer major stages a forced advisory', () async {
      mockPackageInfo(version: '2.0.0', buildNumber: '8');
      final fake = FakeHttp();
      fake.handler = (req, body) async => jsonRes(
          {'platform': 'android', 'version': '3.0.0', 'build': 1}, 200);
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);

      await s.checkForUpdate();

      expect(s.appUpdate, UpdateKind.force);
    });

    test('endpoint failure stays silent', () async {
      mockPackageInfo(version: '2.0.0', buildNumber: '8');
      final fake = FakeHttp();
      fake.handler = (req, body) async => throw Exception('offline');
      final s = SessionController(httpClient: fake);
      addTearDown(s.disposeAll);

      await s.checkForUpdate();

      expect(s.appUpdate, UpdateKind.none);
      expect(s.latestAppVersion, isEmpty);
    });
  });
}
