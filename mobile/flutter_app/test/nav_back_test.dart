// Android back used to close the app from any screen (every route is a
// context.go replacement, so there was nothing to pop).
import 'package:flutter_test/flutter_test.dart';
import 'package:luno_messenger/nav.dart';

void main() {
  test('back walks up to the parent screen and leaves only from home', () {
    expect(LunoNav.backTargetOf('/chats/abc/pins'), '/chats/abc');
    expect(LunoNav.backTargetOf('/chats/abc/settings'), '/chats/abc');
    expect(LunoNav.backTargetOf('/chats/abc'), '/chats');
    expect(LunoNav.backTargetOf('/chats'), '/home');
    expect(LunoNav.backTargetOf('/calls/x'), '/calls');
    expect(LunoNav.backTargetOf('/settings'), '/home');
    expect(LunoNav.backTargetOf('/profile'), '/home');
    expect(LunoNav.backTargetOf('/search'), '/home');
    expect(LunoNav.backTargetOf('/console/users'), '/console');
    expect(LunoNav.backTargetOf('/home'), isNull);
    expect(LunoNav.backTargetOf('/login'), isNull);
  });
}
