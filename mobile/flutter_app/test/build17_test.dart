// Build 17: a friend's profile change appears live (pull-to-refresh is gone).
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';

import 'session_call_test.dart' show FakeHttp, FakeCallMedia, jsonRes, makeSession;

void main() {
  test('profile.updated refetches people lists once (debounced)', () {
    fakeAsync((async) {
      final fake = FakeHttp()
        ..handler = (req, body) async {
          if (req.url.path == '/api/v1/friends') {
            return jsonRes({
              'friends': [
                {'id': 'peer', 'display_name': 'Alice', 'avatar_url': '/api/v1/users/peer/avatar?v=2'}
              ]
            }, 200);
          }
          if (req.url.path == '/api/v1/conversations') {
            return jsonRes({'conversations': []}, 200);
          }
          return jsonRes({}, 200);
        };
      final s = makeSession(fake, FakeCallMedia());
      // photo + cover saved back to back: two events, one refetch
      s.applyProfileUpdated({'type': 'profile.updated', 'user_id': 'peer'});
      s.applyProfileUpdated({'type': 'profile.updated', 'user_id': 'peer'});
      async.elapse(const Duration(milliseconds: 500));
      async.flushMicrotasks();
      expect(fake.calls.where((c) => c.startsWith('GET /api/v1/friends')).length, 1);
      expect(s.friends.single['avatar_url'], '/api/v1/users/peer/avatar?v=2');
      expect(fake.calls.any((c) => c.startsWith('GET /api/v1/me ')), isFalse,
          reason: 'someone else changed: my own profile is not refetched');
    });
  });

  test('my own change from another device refreshes my photo too', () {
    fakeAsync((async) {
      final fake = FakeHttp()
        ..handler = (req, body) async {
          if (req.url.path == '/api/v1/me') {
            return jsonRes({'id': 'me', 'avatar_url': '/a?v=9', 'cover_url': '/c?v=9'}, 200);
          }
          return jsonRes({'friends': [], 'conversations': []}, 200);
        };
      final s = makeSession(fake, FakeCallMedia());
      s.applyProfileUpdated({'type': 'profile.updated', 'user_id': 'me'});
      async.elapse(const Duration(milliseconds: 500));
      async.flushMicrotasks();
      expect(s.selfAvatarUrl, '/a?v=9');
      expect(s.selfCoverUrl, '/c?v=9');
    });
  });
}
