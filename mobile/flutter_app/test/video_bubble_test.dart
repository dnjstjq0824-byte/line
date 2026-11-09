import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/util/inapp_camera.dart';
import 'package:luno_messenger/util/video_bubble.dart';

const _cameraChannel = MethodChannel('plugins.flutter.io/camera');

void mockCameras(Future<dynamic> Function(MethodCall call) handler) {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(_cameraChannel, handler);
}

void main() {
  testWidgets('video bubble idles without touching platform channels', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: VideoBubble(
          url: 'https://video.test/api/v1/attachments/a1/content',
          token: 't',
        ),
      ),
    ));
    expect(find.text('동영상'), findsOneWidget);
    expect(find.byIcon(Icons.play_circle), findsOneWidget);
  });

  testWidgets('video bubble reports playback failure honestly', (WidgetTester tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: VideoBubble(
          url: 'https://video.test/api/v1/attachments/a1/content',
          token: 't',
        ),
      ),
    ));
    await tester.tap(find.byIcon(Icons.play_circle));
    await tester.pump();
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('재생 실패'), findsOneWidget);
  });

  testWidgets('camera sheet reports a denied camera honestly', (WidgetTester tester) async {
    mockCameras((call) async {
      throw PlatformException(code: 'no-camera');
    });
    addTearDown(() => mockCameras((_) async => null));
    await tester.pumpWidget(const MaterialApp(
      home: InAppCameraSheet(),
    ));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('카메라를 사용할 수 없습니다.'), findsOneWidget);
  });

  testWidgets('camera sheet reports an empty camera list honestly', (WidgetTester tester) async {
    mockCameras((call) async => <Map<dynamic, dynamic>>[]);
    addTearDown(() => mockCameras((_) async => null));
    await tester.pumpWidget(const MaterialApp(
      home: InAppCameraSheet(),
    ));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('사용 가능한 카메라가 없습니다.'), findsOneWidget);
  });
}
