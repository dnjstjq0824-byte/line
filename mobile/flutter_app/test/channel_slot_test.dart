import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/state/session.dart';
import 'package:luno_messenger/util/channel_slot.dart';

void main() {
  test('channel slot parses the server shape', () {
    final slot = channelSlotOf({
      'slot': {'id': 'n1', 'title': '공지', 'body': '내용'}
    });
    expect(slot, isNotNull);
    expect(slot!.id, equals('n1'));
    expect(slot.title, equals('공지'));
    expect(slot.body, equals('내용'));
  });

  test('channel slot parses null when nothing is active', () {
    expect(channelSlotOf({'slot': null}), isNull);
    expect(channelSlotOf({}), isNull);
    expect(channelSlotOf(null), isNull);
    expect(channelSlotOf('nope'), isNull);
  });

  test('channel slot rejects misshapen cards', () {
    expect(channelSlotOf({'slot': {'id': 'n1', 'title': '공지'}}), isNull);
    expect(channelSlotOf({'slot': {'id': '', 'title': '공지', 'body': '내용'}}), isNull);
    expect(channelSlotOf({'slot': {'id': 'n1', 'title': '', 'body': '내용'}}), isNull);
    expect(channelSlotOf({'slot': {'id': 'n1', 'title': '공지', 'body': 42}}), isNull);
    expect(channelSlotOf({'slot': 'n1'}), isNull);
  });

  test('session dismiss hides the slot id for the session', () {
    final session = SessionController();
    expect(session.dismissedChannelSlots, isEmpty);
    session.dismissChannelSlot('n1');
    expect(session.dismissedChannelSlots, contains('n1'));
  });

  testWidgets('channel slot card shows text and dismisses', (WidgetTester tester) async {
    var dismissed = false;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ChannelSlotCard(
          slot: const ChannelSlot(id: 'n1', title: '공지', body: '내용'),
          dark: false,
          onDismiss: () => dismissed = true,
        ),
      ),
    ));
    expect(find.text('공지'), findsOneWidget);
    expect(find.text('내용'), findsOneWidget);
    await tester.tap(find.byTooltip('닫기'));
    expect(dismissed, isTrue);
  });
}
