// C4: every dangerous permission goes through withPermissions with a
// rationale dialog, graceful denial, and a settings escape.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:permission_handler/permission_handler.dart';

import 'package:luno_messenger/util/app_permissions.dart';

class FakeGateway extends PermissionGateway {
  FakeGateway({
    this.granted = false,
    this.rationale = false,
    PermissionStatus? requestResult,
    this.throwOnRequest = false,
  }) : requestResult = requestResult ?? PermissionStatus.granted;

  final bool granted;
  final bool rationale;
  final PermissionStatus requestResult;
  final bool throwOnRequest;
  int requestCalls = 0;
  bool settingsOpened = false;

  @override
  Future<bool> isGranted(Permission p) async => granted;

  @override
  Future<bool> shouldShowRationale(Permission p) async => rationale;

  @override
  Future<PermissionStatus> request(Permission p) async {
    requestCalls++;
    if (throwOnRequest) throw Exception('native boom');
    return requestResult;
  }

  @override
  Future<bool> openSettings() async {
    settingsOpened = true;
    return true;
  }
}

void main() {
  group('ensureAppPermission', () {
    test('already granted never touches the native request', () async {
      final gateway = FakeGateway(granted: true);
      final flow = await ensureAppPermission(
        Permission.camera,
        showRationale: () async => fail('must not show rationale'),
        gateway: gateway,
      );
      expect(flow, PermissionFlow.granted);
      expect(gateway.requestCalls, 0);
    });

    test('shows rationale before re-requesting a denied permission', () async {
      var rationaleCalls = 0;
      final flow = await ensureAppPermission(
        Permission.microphone,
        showRationale: () async => rationaleCalls++,
        gateway: FakeGateway(rationale: true),
      );
      expect(flow, PermissionFlow.granted);
      expect(rationaleCalls, 1);
    });

    test('first request skips the rationale dialog', () async {
      final flow = await ensureAppPermission(
        Permission.camera,
        showRationale: () async => fail('must not show rationale'),
        gateway: FakeGateway(rationale: false),
      );
      expect(flow, PermissionFlow.granted);
    });

    test('denied request resolves to denied, never throws', () async {
      final flow = await ensureAppPermission(
        Permission.camera,
        gateway: FakeGateway(requestResult: PermissionStatus.denied),
      );
      expect(flow, PermissionFlow.denied);
    });

    test('permanently denied request resolves to permanentlyDenied', () async {
      final flow = await ensureAppPermission(
        Permission.camera,
        gateway:
            FakeGateway(requestResult: PermissionStatus.permanentlyDenied),
      );
      expect(flow, PermissionFlow.permanentlyDenied);
    });

    test('native failure resolves to denied, never throws', () async {
      final flow = await ensureAppPermission(
        Permission.camera,
        gateway: FakeGateway(throwOnRequest: true),
      );
      expect(flow, PermissionFlow.denied);
    });
  });

  group('withPermissions', () {
    testWidgets('granted runs the action and returns true', (tester) async {
      var ran = false;
      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  result = await withPermissions(
                    context,
                    permissions: const [
                      (
                        Permission.microphone,
                        '마이크 권한 필요',
                        '음성 메시지를 녹음하는 데 사용합니다.'
                      ),
                    ],
                    action: () async => ran = true,
                    gateway: FakeGateway(granted: true),
                  );
                },
                child: const Text('go'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(ran, isTrue);
      expect(result, isTrue);
    });

    testWidgets('denied skips the action and shows a snackbar', (tester) async {
      var ran = false;
      bool? result;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () async {
                  result = await withPermissions(
                    context,
                    permissions: const [
                      (Permission.camera, '카메라 권한 필요', '촬영에 사용합니다.'),
                    ],
                    action: () async => ran = true,
                    gateway:
                        FakeGateway(requestResult: PermissionStatus.denied),
                  );
                },
                child: const Text('go'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      expect(ran, isFalse);
      expect(result, isFalse);
      expect(find.text('권한이 거부되었습니다.'), findsOneWidget);
      expect(find.text('설정으로 이동'), findsNothing);
    });

    testWidgets('permanently denied offers the settings escape',
        (tester) async {
      final gateway = FakeGateway(
        requestResult: PermissionStatus.permanentlyDenied,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => withPermissions(
                  context,
                  permissions: const [
                    (Permission.camera, '카메라 권한 필요', '촬영에 사용합니다.'),
                  ],
                  gateway: gateway,
                ),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.textContaining('설정에서 직접 허용'), findsOneWidget);
      await tester.tap(find.text('설정으로 이동'));
      await tester.pumpAndSettle();
      expect(gateway.settingsOpened, isTrue);
    });

    testWidgets('rationale dialog precedes the re-request', (tester) async {
      var ran = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => withPermissions(
                  context,
                  permissions: const [
                    (Permission.camera, '카메라 권한 필요', '촬영에 사용합니다.'),
                  ],
                  action: () async => ran = true,
                  gateway: FakeGateway(rationale: true),
                ),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pump();
      expect(find.text('카메라 권한 필요'), findsOneWidget);
      expect(find.text('촬영에 사용합니다.'), findsOneWidget);
      await tester.tap(find.text('계속'));
      await tester.pumpAndSettle();
      expect(ran, isTrue);
    });

    testWidgets('a later denial short-circuits the action', (tester) async {
      var ran = false;
      final gateway = _ScriptedGateway({
        Permission.microphone: PermissionStatus.granted,
        Permission.camera: PermissionStatus.denied,
      });
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => ElevatedButton(
                onPressed: () => withPermissions(
                  context,
                  permissions: const [
                    (Permission.microphone, '마이크 권한 필요', '통화에 사용합니다.'),
                    (Permission.camera, '카메라 권한 필요', '영상통화에 사용합니다.'),
                  ],
                  action: () async => ran = true,
                  gateway: gateway,
                ),
                child: const Text('go'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(ran, isFalse);
      expect(find.text('권한이 거부되었습니다.'), findsOneWidget);
    });
  });
}

class _ScriptedGateway extends FakeGateway {
  _ScriptedGateway(this.script);
  final Map<Permission, PermissionStatus> script;

  @override
  Future<PermissionStatus> request(Permission p) async {
    requestCalls++;
    return script[p] ?? PermissionStatus.denied;
  }
}
