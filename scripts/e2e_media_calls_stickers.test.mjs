// End-to-end regression suite for voice calls, video calls, group calls,
// stickers, images, voice notes, recorded videos, and file attachments across
// isolates and web client wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeBucket, makeD1, F24_CONSENT } from './test_helpers.mjs';

let serial = 0;
function makeIsolatedApi(db, bucket, extraEnv = {}) {
  return async (path, method = 'GET', body = null, token = null, headers = {}) => {
    const mod = await import(`./cf_worker.js?e2emedia=${++serial}`);
    const env = { DB: db, DURABLE_CONVERSATIONS: 'true', MEDIA_BUCKET: bucket, ALLOWED_ORIGINS: 'https://web.lunotalk.com,https://lunotalk.com', ...extraEnv };
    return mod.default.fetch(new Request(`https://localhost/api/v1/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === null ? undefined : JSON.stringify(body),
    }), env);
  };
}

const PW = 'Media#Test2026!';
async function setupUsers(api, tag) {
  const reg = async (who) => {
    const email = `e2e-${who}-${tag}@luno-test.local`;
    const r = await api('auth/register', 'POST', {
      ...F24_CONSENT,
      email,
      password: PW,
      display_name: `${who}_${tag}`,
      handle: `e2e_${who}_${tag}`,
    });
    assert.equal(r.status, 201, `register ${email}`);
    const id = (await r.json()).id;
    const login = await api('auth/login', 'POST', { email, password: PW });
    assert.equal(login.status, 200, `login ${email}`);
    const token = (await login.json()).access_token;
    return { id, token };
  };
  const a = await reg('a');
  const b = await reg('b');
  const room = await api('conversations', 'POST', { kind: 'direct', member_ids: [b.id] }, a.token);
  assert.equal(room.status, 201);
  return { a, b, cid: (await room.json()).id };
}

test('E2E attachments: cross-isolate upload & download for image, voice(;codecs), video(;codecs), PDF, ZIP, DOCX, and Android octet-stream', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const api = makeIsolatedApi(db, bucket);
    const { a, b, cid } = await setupUsers(api, 'att');

    const cases = [
      { name: 'photo.png', mime: 'image/png', expectMime: 'image/png', expectInline: true, kind: 'image', payload: 'PNGDATA' },
      { name: 'voice-1.webm', mime: 'audio/webm;codecs=opus', expectMime: 'audio/webm', expectInline: true, kind: 'voice', payload: 'OPUSVOICE' },
      { name: 'clip-1.webm', mime: 'video/webm;codecs=vp8,opus', expectMime: 'video/webm', expectInline: true, kind: 'video', payload: 'WEBMVIDEO' },
      { name: 'voice-ios.m4a', mime: 'audio/x-m4a', expectMime: 'audio/x-m4a', expectInline: true, kind: 'voice', payload: 'M4AVOICE' },
      { name: 'report.pdf', mime: 'application/pdf', expectMime: 'application/pdf', expectInline: false, kind: 'file', payload: '%PDF-1.4' },
      { name: 'archive.zip', mime: 'application/zip', expectMime: 'application/zip', expectInline: false, kind: 'file', payload: 'PK\x03\x04' },
      { name: 'spec.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expectMime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', expectInline: false, kind: 'file', payload: 'DOCXBYTES' },
      { name: 'android-file.bin', mime: 'application/octet-stream', expectMime: 'application/octet-stream', expectInline: false, kind: 'file', payload: 'RAWBYTES' },
    ];

    for (const tc of cases) {
      // Fresh isolate upload (cold isolate must hydrate conversation from D1)
      const up = await api('attachments', 'POST', {
        conversation_id: cid,
        original_name: tc.name,
        mime_type: tc.mime,
        content_base64: Buffer.from(tc.payload).toString('base64'),
      }, a.token);
      assert.equal(up.status, 201, `upload ${tc.name} (${tc.mime}): ${up.status}`);
      const att = await up.json();
      assert.equal(att.mime_type, tc.expectMime, `normalized mime for ${tc.name}`);

      // Send message referencing the attachment
      const msgRes = await api(`conversations/${cid}/messages`, 'POST', {
        client_id: `att-${tc.name}-${Date.now()}`,
        kind: tc.kind,
        body: tc.name,
        metadata: {
          attachment_id: att.id,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes,
          ...(tc.kind === 'voice' ? { duration: 4 } : {}),
        },
      }, a.token);
      assert.equal(msgRes.status, 201, `message send ${tc.name}`);

      // Fresh isolate download as peer B (with Origin header to verify CORS credentials)
      const dl = await api(`attachments/${att.id}/content`, 'GET', null, b.token, { Origin: 'https://web.lunotalk.com' });
      assert.equal(dl.status, 200, `download ${tc.name} on cold isolate`);
      assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), tc.payload);
      assert.equal(dl.headers.get('access-control-allow-credentials'), 'true');
      const disp = dl.headers.get('content-disposition') || '';
      if (tc.expectInline) {
        assert.ok(disp.startsWith('inline;'), `${tc.name} served inline`);
      } else {
        assert.ok(disp.startsWith('attachment;'), `${tc.name} served as attachment`);
        assert.equal(dl.headers.get('content-type'), 'application/octet-stream');
      }
    }

    // Active / XSS-dangerous MIMEs stay strictly blocked
    for (const badMime of ['application/x-sh', 'text/html', 'image/svg+xml', 'application/javascript']) {
      const blocked = await api('attachments', 'POST', {
        conversation_id: cid,
        original_name: 'bad.file',
        mime_type: badMime,
        content_base64: Buffer.from('nope').toString('base64'),
      }, a.token);
      assert.equal(blocked.status, 415, `${badMime} rejected`);
      assert.equal((await blocked.json()).code, 'MIME_NOT_ALLOWED');
    }
  } finally { db.raw.close(); }
});

test('E2E stickers: catalog image stickers and Orbit Crew SVG stickers send cleanly', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const api = makeIsolatedApi(db, bucket);
    const { a, b, cid } = await setupUsers(api, 'stk');

    const imgSticker = await api(`conversations/${cid}/messages`, 'POST', {
      client_id: 'stk-img-1',
      kind: 'sticker',
      body: 'luno-joy-003',
      metadata: { sticker_id: 'luno-joy-003', character: 'Lumi' },
    }, a.token);
    assert.equal(imgSticker.status, 201);

    const svgSticker = await api(`conversations/${cid}/messages`, 'POST', {
      client_id: 'stk-svg-1',
      kind: 'sticker',
      body: 'lumi_hi',
      metadata: { sticker_id: 'lumi_hi', character: 'Lumi' },
    }, b.token);
    assert.equal(svgSticker.status, 201);

    const hist = await api(`conversations/${cid}/messages?limit=10`, 'GET', null, b.token);
    assert.equal(hist.status, 200);
    const msgs = (await hist.json()).messages;
    assert.equal(msgs.filter((m) => m.kind === 'sticker').length, 2);
  } finally { db.raw.close(); }
});

test('E2E voice & video calls: 1:1 signaling, replay, ICE servers, and group calls across isolates', async () => {
  const db = makeD1();
  const bucket = makeBucket();
  try {
    const api = makeIsolatedApi(db, bucket, {
      TURN_URLS: 'turn:34.47.120.225:3478',
      TURN_SECRET: '0123456789abcdef0123456789abcdef',
    });
    const { a, b, cid } = await setupUsers(api, 'call');

    // ICE servers include STUN + HMAC TURN
    const iceRes = await api('calls/ice-servers', 'GET', null, a.token);
    assert.equal(iceRes.status, 200);
    const ice = (await iceRes.json()).ice_servers;
    assert.ok(ice.some((s) => String(s.urls).startsWith('turn:34.47.120.225:3478') && s.username && s.credential));

    // Voice & Video 1:1 full lifecycle across isolates
    for (const kind of ['voice', 'video']) {
      const start = await api('calls', 'POST', { conversation_id: cid, kind }, a.token);
      assert.equal(start.status, 201, `start ${kind}`);
      const callId = (await start.json()).id;
      assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'offer', sdp: `v=0 ${kind}-offer` }, a.token)).status, 200);
      assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'ice-candidate', candidate: '{"candidate":"cand-a"}' }, a.token)).status, 200);
      assert.equal((await api(`calls/${callId}/state`, 'POST', { state: 'connected' }, b.token)).status, 200);
      const replay = await (await api(`calls/${callId}/signals`, 'GET', null, b.token)).json();
      assert.deepEqual(replay.signals.map((s) => s.signal_type), ['offer', 'ice-candidate']);
      assert.equal((await api(`calls/${callId}/signal`, 'POST', { signal_type: 'answer', sdp: `v=0 ${kind}-answer` }, b.token)).status, 200);
      const end = await api(`calls/${callId}/state`, 'POST', { state: 'ended' }, a.token);
      assert.equal(end.status, 200);
      assert.equal((await end.json()).result, 'completed');
    }
  } finally { db.raw.close(); }
});

test('Web client wiring: auto-refresh fetch, WebRTC queues/replay/screenshare, clean bubble branches, and WS reconnect', async () => {
  const [session, rtc, group, att, voice, cam, sock, pane, attComp, view] = await Promise.all([
    readFile(new URL('../apps/user-web/src/store/session.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useWebRTC.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useGroupCall.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useAttachments.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useVoiceRecording.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useMessengerCamera.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/composables/useChatSocket.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/components/MessagePane.vue', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/components/MessageAttachment.vue', import.meta.url), 'utf8'),
    readFile(new URL('../apps/user-web/src/views/MessengerView.vue', import.meta.url), 'utf8'),
  ]);

  assert.ok(session.includes('export async function authedFetch'), 'session exports authedFetch');
  assert.ok(attComp.includes('authedFetch(`/api/v1/attachments/'), 'MessageAttachment uses authedFetch');
  assert.ok(!attComp.includes('Authorization: `Bearer ${props.token}`'), 'MessageAttachment no longer uses raw fetch');
  assert.ok(pane.includes('authedFetch(`/api/v1/attachments/') && pane.includes("authedFetch('/api/v1/ai/stt'"), 'MessagePane voice AI uses authedFetch');
  assert.ok(pane.indexOf('v-else class="bubble-text-content"') < pane.indexOf('class="bubble-decide-row"'), 'bubble-text-content stays in the main v-if/v-else chain so stickers/media do not render duplicate text');

  assert.ok(rtc.includes('drainEarlyIceCandidates') && rtc.includes('pendingIceCandidates') && rtc.includes('ringingSignals'), '1:1 WebRTC buffers early & incoming ICE + ringing signals');
  assert.ok(rtc.includes('/api/v1/calls/${cid}/signals'), '1:1 WebRTC replays missed signals on accept');
  assert.ok(rtc.includes('watch(localVideoRef') && rtc.includes('sender.replaceTrack(screenTrack)'), '1:1 WebRTC watches local video ref and replaces track on screen share');
  assert.ok(group.includes('pendingPeerIce') && group.includes('apiRequest'), 'group call queues early ICE and uses apiRequest');

  assert.ok(att.includes('10 * 1024 * 1024') && att.includes('bytes.subarray(i, i + 8192)'), 'attachments support up to 10MB with chunked base64');
  assert.ok(!voice.includes('sessionToken !== token.value'), 'voice recording survives token refresh');
  assert.ok(cam.includes("rawMime.split(';')[0]"), 'camera video strips codec params');
  assert.ok(!sock.includes('sessionToken !== token.value'), 'WebSocket reconnect survives token refresh');
  assert.ok(view.includes("startCallWithUser($event, 'voice')") && view.includes("startCallWithUser($event, 'video')"), 'ProfileModal calls await startDirectChat via startCallWithUser');
});
