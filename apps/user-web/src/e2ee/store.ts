// E5: web E2EE session store. 1:1 rooms via X3DH + Double Ratchet with
// per-device fanout; group rooms refuse until E6 sender keys land.
// Key material lives in IndexedDB (idb.ts), wiped on logout.
import type {
  IdentityKeys,
} from '../../../shared/e2ee/keys.ts';
import {
  encodeIdentity,
  generateIdentity,
  generateSignedPrekey,
  parseIdentity,
  randomBytes,
  verifyPrekeySig,
  x25519Public,
} from '../../../shared/e2ee/keys.ts';
import { x3dhInitiate, x3dhRespond } from '../../../shared/e2ee/x3dh.ts';
import type {
  RatchetState,
} from '../../../shared/e2ee/ratchet.ts';
import {
  decodeHeader,
  deserializeRatchet,
  encodeHeader,
  ratchetDecrypt,
  ratchetEncrypt,
  ratchetInitInitiator,
  ratchetInitResponder,
  serializeRatchet,
} from '../../../shared/e2ee/ratchet.ts';
import { decodeEnvelope, encodeEnvelope } from '../../../shared/e2ee/envelope.ts';
import { b64uDecode, b64uEncode, utf8Decode, utf8Encode } from '../../../shared/e2ee/codec.ts';
import {
  createSenderKey,
  exportSenderKey,
  importSenderKey,
  senderDecrypt,
  senderEncrypt,
} from '../../../shared/e2ee/sender.ts';

export interface KeyValue {
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  del(k: string): Promise<void>;
}

export class MemoryKV implements KeyValue {
  private m = new Map<string, string>();
  async get(k: string): Promise<string | null> { return this.m.get(k) ?? null; }
  async set(k: string, v: string): Promise<void> { this.m.set(k, v); }
  async del(k: string): Promise<void> { this.m.delete(k); }
}

export type ApiFn = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

export interface RoomRef {
  id: string;
  kind: string;
  memberIds: string[];
  e2ee: boolean;
}

export interface InnerMessage {
  kind: string;
  body: string;
  meta?: Record<string, unknown>;
}

interface SessionRecord {
  ratchet: string;
  peerIdentity: string;
  peerDevice: string;
  eph: string | null;
  opkPub: string | null;
  prekeySent: boolean;
}

interface DeviceBundle {
  user_id: string;
  device_id: string;
  identity_key: string;
  signed_prekey: string;
  prekey_sig: string;
  one_time_prekey: string | null;
}

interface SpkEntry {
  id: number;
  priv: string;
  pub: string;
  sig: string;
  ts: number;
}

const OPK_BATCH = 20;
const OPK_TOPUP_AFTER = 10;
const SPK_ROTATE_MS = 7 * 86400 * 1000;
const SPK_KEEP = 5;

export class E2eeStore {
  private kv: KeyValue;
  private api: ApiFn;
  private userId: string;
  private deviceId: string;
  private readyDone = false;
  private identity: IdentityKeys | null = null;
  private spks: SpkEntry[] = [];
  private opkPrivs: Record<string, string> = {};
  private opkUsedSincePut = 0;

  constructor(opts: { kv: KeyValue; api: ApiFn; userId: string; deviceId: string }) {
    this.kv = opts.kv;
    this.api = opts.api;
    this.userId = opts.userId;
    this.deviceId = opts.deviceId;
  }

  private k(...parts: string[]): string {
    return ['e2ee', this.userId, this.deviceId, ...parts].join(':');
  }

  async ready(): Promise<void> {
    if (this.readyDone) return;
    const rawId = await this.kv.get(this.k('identity'));
    if (rawId) {
      const o = JSON.parse(rawId);
      this.identity = {
        xPriv: b64uDecode(o.xPriv), xPub: b64uDecode(o.xPub),
        edPriv: b64uDecode(o.edPriv), edPub: b64uDecode(o.edPub),
      };
      this.spks = JSON.parse((await this.kv.get(this.k('spks'))) || '[]');
      this.opkPrivs = JSON.parse((await this.kv.get(this.k('opks'))) || '{}');
      this.opkUsedSincePut = Number(await this.kv.get(this.k('opkUsed')) || 0);
    } else {
      this.identity = generateIdentity();
      this.spks = [];
      this.opkPrivs = {};
      await this.persistKeys();
    }
    const newest = this.spks.length ? this.spks[this.spks.length - 1] : null;
    if (!newest || Date.now() - newest.ts > SPK_ROTATE_MS || Object.keys(this.opkPrivs).length === 0 || this.opkUsedSincePut >= OPK_TOPUP_AFTER) {
      await this.publishBundle();
    }
    this.readyDone = true;
  }

  private async persistKeys(): Promise<void> {
    const id = this.identity!;
    await this.kv.set(this.k('identity'), JSON.stringify({
      xPriv: b64uEncode(id.xPriv), xPub: b64uEncode(id.xPub),
      edPriv: b64uEncode(id.edPriv), edPub: b64uEncode(id.edPub),
    }));
    await this.kv.set(this.k('spks'), JSON.stringify(this.spks));
    await this.kv.set(this.k('opks'), JSON.stringify(this.opkPrivs));
    await this.kv.set(this.k('opkUsed'), String(this.opkUsedSincePut));
  }

  private async publishBundle(): Promise<void> {
    const id = this.identity!;
    let spk = this.spks.length ? this.spks[this.spks.length - 1] : null;
    if (!spk || Date.now() - spk.ts > SPK_ROTATE_MS) {
      const nextId = spk ? spk.id + 1 : 1;
      const gen = generateSignedPrekey(id, nextId);
      spk = { id: nextId, priv: b64uEncode(gen.priv), pub: b64uEncode(gen.pub), sig: b64uEncode(gen.sig), ts: Date.now() };
      this.spks.push(spk);
      while (this.spks.length > SPK_KEEP) this.spks.shift();
    }
    const freshOpks: string[] = [];
    for (let i = 0; i < OPK_BATCH; i++) {
      const priv = randomBytes(32);
      const pubB = b64uEncode(x25519Public(priv));
      this.opkPrivs[pubB] = b64uEncode(priv);
      freshOpks.push(pubB);
    }
    const privKeys = Object.keys(this.opkPrivs);
    while (privKeys.length > 500) delete this.opkPrivs[privKeys.shift()!];
    this.opkUsedSincePut = 0;
    await this.persistKeys();
    await this.api('devices/' + this.deviceId + '/keys', 'PUT', {
      identity_key: encodeIdentity(id),
      signed_prekey: spk.pub,
      prekey_sig: spk.sig,
      one_time_prekeys: freshOpks,
    });
  }

  private async loadSession(peerUser: string, peerDevice: string): Promise<SessionRecord | null> {
    const raw = await this.kv.get(this.k('sess', peerUser, peerDevice));
    return raw ? (JSON.parse(raw) as SessionRecord) : null;
  }

  private async saveSession(peerUser: string, peerDevice: string, rec: SessionRecord): Promise<void> {
    await this.kv.set(this.k('sess', peerUser, peerDevice), JSON.stringify(rec));
  }

  private async fetchBundles(userId: string): Promise<DeviceBundle[]> {
    const res = await this.api<{ devices?: DeviceBundle[] }>(
      `users/${userId}/keys?all=1`, 'GET');
    return res.devices || [];
  }

  private async sessionFor(bundle: DeviceBundle): Promise<{ st: RatchetState; fresh: boolean; eph: string | null }> {
    const rec = await this.loadSession(bundle.user_id, bundle.device_id);
    if (rec) {
      return { st: deserializeRatchet(rec.ratchet), fresh: false, eph: null };
    }
    if (bundle.prekey_sig && !verifyPrekeySig(bundle.identity_key, b64uDecode(bundle.signed_prekey), b64uDecode(bundle.prekey_sig))) {
      throw new Error('bad bundle signature');
    }
    const their = parseIdentity(bundle.identity_key);
    if (!their) throw new Error('bad bundle identity');
    const id = this.identity!;
    const init = x3dhInitiate(id.xPriv, {
      identityX: their.x,
      signedPrekey: b64uDecode(bundle.signed_prekey),
      oneTimePrekey: bundle.one_time_prekey ? b64uDecode(bundle.one_time_prekey) : null,
    });
    const st = ratchetInitInitiator(init.sharedSecret, b64uDecode(bundle.signed_prekey));
    const eph = b64uEncode(init.ephemeralPub);
    await this.saveSession(bundle.user_id, bundle.device_id, {
      ratchet: serializeRatchet(st),
      peerIdentity: bundle.identity_key,
      peerDevice: bundle.device_id,
      eph,
      opkPub: bundle.one_time_prekey,
      prekeySent: false,
    });
    return { st, fresh: true, eph };
  }

  /** Encrypt for every device of every other member plus our other devices. */
  async encryptRoom(room: RoomRef, inner: InnerMessage): Promise<string> {
    await this.ready();
    // E6: groups use sender keys; 1:1/Keep rooms use pairwise fanout.
    if (room.kind === 'group') return this.encryptGroup(room, inner);
    const targets = new Set(room.memberIds.filter((m) => m !== this.userId));
    targets.add(this.userId); // own devices, including this one (own history)
    const innerBytes = utf8Encode(JSON.stringify({ kind: inner.kind, body: inner.body, ...(inner.meta ? { meta: inner.meta } : {}) }));
    const msgs: Record<string, Record<string, unknown>> = {};
    for (const uid of targets) {
      const bundles = await this.fetchBundles(uid);
      const perDevice: Record<string, unknown> = {};
      for (const b of bundles) {
        const { st, fresh, eph } = await this.sessionFor(b);
        const rec = (await this.loadSession(uid, b.device_id))!;
        const ct = await ratchetEncrypt(st, innerBytes);
        await this.saveSession(uid, b.device_id, { ...rec, ratchet: serializeRatchet(st), prekeySent: true });
        if (fresh) {
          perDevice[b.device_id] = JSON.parse(encodeEnvelope({
            v: 1, type: 'prekey',
            ik: encodeIdentity(this.identity!),
            ek: eph!,
            spkId: null, opkId: rec.opkPub,
            spk: b.signed_prekey,
            header: encodeHeader(ct.header),
            iv: b64uEncode(ct.iv), ct: b64uEncode(ct.ct),
          }));
        } else {
          perDevice[b.device_id] = JSON.parse(encodeEnvelope({
            v: 1, type: 'msg',
            header: encodeHeader(ct.header),
            iv: b64uEncode(ct.iv), ct: b64uEncode(ct.ct),
          }));
        }
      }
      if (Object.keys(perDevice).length) msgs[uid] = perDevice;
    }
    return JSON.stringify({
      v: 1,
      from: { user: this.userId, device: this.deviceId },
      msgs,
    });
  }

  // ---------- E6: sender keys for group rooms ----------

  private async loadOwnSenderKey(roomId: string): Promise<{ gen: number; chain: string; signPriv: string; signPub: string; n: number; dealt: Record<string, number>; members: string[] } | null> {
    const raw = await this.kv.get(this.k('skown', roomId));
    return raw ? JSON.parse(raw) : null;
  }

  private async saveOwnSenderKey(roomId: string, rec: { gen: number; chain: string; signPriv: string; signPub: string; n: number; dealt: Record<string, number>; members: string[] }): Promise<void> {
    await this.kv.set(this.k('skown', roomId), JSON.stringify(rec));
  }

  private async loadPeerSenderKey(roomId: string, senderId: string, gen: number): Promise<{ gen: number; chain: string; signPub: string; n: number; skipped: Array<{ n: number; mk: string }> } | null> {
    const raw = await this.kv.get(this.k('skin', roomId, senderId, String(gen)));
    return raw ? JSON.parse(raw) : null;
  }

  private async savePeerSenderKey(roomId: string, senderId: string, gen: number, rec: { chain: string; signPub: string; n: number; skipped: Array<{ n: number; mk: string }> }): Promise<void> {
    await this.kv.set(this.k('skin', roomId, senderId, String(gen)), JSON.stringify({ ...rec, gen }));
  }

  /** Ensure our sender key for the room, rotate on member exit, deal to newcomers. */
  private async ensureSenderKey(room: RoomRef): Promise<{ gen: number; chain: string; signPriv: string; signPub: string; n: number; dealt: Record<string, number>; members: string[] }> {
    let rec = await this.loadOwnSenderKey(room.id);
    const members = [...room.memberIds].sort();
    const left = (rec?.members || []).filter((m) => !members.includes(m));
    if (!rec || !rec.chain || left.length > 0) {
      const sk = createSenderKey((rec?.gen || 0) + 1);
      const exp = exportSenderKey(sk);
      rec = {
        gen: (rec?.gen || 0) + 1,
        chain: exp.chain,
        signPriv: exp.signPriv || '',
        signPub: exp.signPub,
        n: 0,
        dealt: {},
        members,
      };
    }
    for (const uid of members) {
      if (uid === this.userId) continue;
      if (rec.dealt[uid] === rec.gen) continue;
      await this.dealSenderKey(room.id, uid, rec);
      rec.dealt[uid] = rec.gen;
    }
    rec.members = members;
    await this.saveOwnSenderKey(room.id, rec);
    return rec;
  }

  private async dealSenderKey(roomId: string, toUser: string, rec: { gen: number; chain: string; signPub: string }): Promise<void> {
    const bundles = await this.fetchBundles(toUser);
    const envelopes: Record<string, unknown> = {};
    for (const b of bundles) {
      const { st, fresh, eph } = await this.sessionFor(b);
      const saved = (await this.loadSession(toUser, b.device_id))!;
      const ct = await ratchetEncrypt(st, utf8Encode(JSON.stringify({
        kind: 'sk',
        body: '',
        meta: { room: roomId, gen: rec.gen, chain: rec.chain, signPub: rec.signPub },
      })));
      await this.saveSession(toUser, b.device_id, { ...saved, ratchet: serializeRatchet(st), prekeySent: true });
      envelopes[b.device_id] = fresh
        ? JSON.parse(encodeEnvelope({
          v: 1, type: 'prekey', ik: encodeIdentity(this.identity!),
          ek: eph!, spkId: null, opkId: saved.opkPub, spk: b.signed_prekey,
          header: encodeHeader(ct.header), iv: b64uEncode(ct.iv), ct: b64uEncode(ct.ct),
        }))
        : JSON.parse(encodeEnvelope({
          v: 1, type: 'msg',
          header: encodeHeader(ct.header), iv: b64uEncode(ct.iv), ct: b64uEncode(ct.ct),
        }));
    }
    if (!Object.keys(envelopes).length) return;
    await this.api('e2ee/sk', 'POST', {
      to_user: toUser,
      room: roomId,
      gen: rec.gen,
      from_device: this.deviceId,
      envelopes,
    });
  }

  /** Import pending sender keys for a room (called on open + unknown gen). */
  async fetchSenderKeys(roomId?: string): Promise<void> {
    await this.ready();
    const res = await this.api<{ parcels?: Array<{ id: string; from_user_id: string; from_device?: string; room_id: string; gen: number; envelopes: Record<string, unknown> }> }>(
      roomId ? `e2ee/sk?room=${encodeURIComponent(roomId)}` : 'e2ee/sk', 'GET');
    for (const p of res.parcels || []) {
      const env = p.envelopes[this.deviceId];
      if (!env) continue;
      const inner = await this.decryptBody(p.from_user_id, JSON.stringify({
        v: 1,
        from: { user: p.from_user_id, device: p.from_device || 'unknown' },
        msgs: { [this.userId]: { [this.deviceId]: env } },
      }));
      if (inner && inner.kind === 'sk' && inner.meta && typeof inner.meta === 'object') {
        const meta = inner.meta as Record<string, unknown>;
        if (typeof meta.chain === 'string' && typeof meta.signPub === 'string' && typeof meta.gen === 'number') {
          await this.savePeerSenderKey(p.room_id, p.from_user_id, meta.gen as number, {
            chain: meta.chain as string,
            signPub: meta.signPub as string,
            n: 0,
            skipped: [],
          });
          try {
            await this.api(`e2ee/sk/${p.id}`, 'DELETE');
          } catch { /* redelivery is harmless */ }
        }
      }
    }
  }

  private async encryptGroup(room: RoomRef, inner: InnerMessage): Promise<string> {
    const rec = await this.ensureSenderKey(room);
    const sk = importSenderKey(b64uDecode(rec.chain), b64uDecode(rec.signPub), rec.gen);
    (sk as unknown as { n: number }).n = rec.n;
    (sk as unknown as { signPriv: Uint8Array }).signPriv = b64uDecode(rec.signPriv);
    const msg = await senderEncrypt(sk, this.userId, utf8Encode(JSON.stringify({ kind: inner.kind, body: inner.body, ...(inner.meta ? { meta: inner.meta } : {}) })));
    rec.n = sk.n;
    rec.chain = b64uEncode(sk.chain);
    await this.saveOwnSenderKey(room.id, rec);
    return JSON.stringify({
      v: 1,
      type: 'groupmsg',
      from: { user: this.userId, device: this.deviceId },
      room: room.id,
      sender: this.userId,
      gen: msg.gen,
      n: msg.n,
      iv: b64uEncode(msg.iv),
      ct: b64uEncode(msg.ct),
      sig: b64uEncode(msg.sig),
    });
  }

  private async decryptGroup(senderId: string, o: Record<string, unknown>): Promise<InnerMessage | null> {
    const roomId = String(o.room || '');
    const gen = Number(o.gen);
    let rec = await this.loadPeerSenderKey(roomId, senderId, gen);
    if (!rec) {
      await this.fetchSenderKeys(roomId);
      rec = await this.loadPeerSenderKey(roomId, senderId, gen);
      if (!rec) return null;
    }
    const sk = importSenderKey(b64uDecode(rec.chain), b64uDecode(rec.signPub), rec.gen);
    sk.n = rec.n;
    sk.skipped = rec.skipped;
    try {
      const pt = await senderDecrypt(sk, senderId, {
        gen,
        n: Number(o.n),
        iv: b64uDecode(o.iv as string),
        ct: b64uDecode(o.ct as string),
        sig: b64uDecode(o.sig as string),
      });
      await this.savePeerSenderKey(roomId, senderId, gen, {
        chain: b64uEncode(sk.chain), signPub: rec.signPub, n: sk.n, skipped: sk.skipped,
      });
      return JSON.parse(new TextDecoder().decode(pt)) as InnerMessage;
    } catch {
      return null;
    }
  }

  /** Decrypt one incoming ciphertext body for this device. Null when undecryptable. */
  async decryptBody(senderId: string, body: string): Promise<InnerMessage | null> {
    await this.ready();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      return null;
    }
    // E6: group sender-key message.
    if (parsed && typeof parsed === 'object' && parsed.type === 'groupmsg') {
      return this.decryptGroup(senderId, parsed);
    }
    let fan: { from?: { user: string; device: string }; msgs?: Record<string, Record<string, unknown>> };
    try {
      fan = JSON.parse(body);
    } catch {
      return null;
    }
    if (!fan || typeof fan !== 'object' || !fan.msgs) return null;
    const mine = fan.msgs[this.userId]?.[this.deviceId];
    if (!mine) return null;
    let env;
    try {
      env = decodeEnvelope(JSON.stringify(mine));
    } catch {
      return null;
    }
    const fromDevice = fan.from?.device || 'unknown';
    if (env.type === 'prekey') {
      const their = parseIdentity(env.ik);
      if (!their) return null;
      const spk = this.spks.find((s) => s.pub === env.spk) || this.spks[this.spks.length - 1];
      if (!spk) return null;
      let opkPriv: Uint8Array | null = null;
      if (env.opkId) {
        const hex = this.opkPrivs[env.opkId];
        if (!hex) return null;
        opkPriv = b64uDecode(hex);
        this.opkUsedSincePut += 1;
        await this.persistKeys();
        if (this.opkUsedSincePut >= OPK_TOPUP_AFTER) {
          await this.publishBundle();
        }
      }
      const sk = x3dhRespond(
        this.identity!.xPriv, b64uDecode(spk.priv), opkPriv, their.x, b64uDecode(env.ek));
      const st = ratchetInitResponder(sk, b64uDecode(spk.priv));
      const header = decodeHeader(env.header);
      let pt: Uint8Array;
      try {
        pt = await ratchetDecrypt(st, { header, iv: b64uDecode(env.iv), ct: b64uDecode(env.ct) }, b64uDecode(spk.priv));
      } catch {
        return null;
      }
      await this.saveSession(senderId, fromDevice, {
        ratchet: serializeRatchet(st),
        peerIdentity: env.ik,
        peerDevice: fromDevice,
        eph: null,
        opkPub: null,
        prekeySent: true,
      });
      try {
        return JSON.parse(utf8Decode(pt)) as InnerMessage;
      } catch {
        return null;
      }
    }
    const existing = await this.loadSession(senderId, fromDevice);
    if (!existing || env.type !== 'msg') return null;
    try {
      const st = deserializeRatchet(existing.ratchet);
      const header = decodeHeader(env.header);
      const pt = await ratchetDecrypt(st, { header, iv: b64uDecode(env.iv), ct: b64uDecode(env.ct) }, null);
      await this.saveSession(senderId, fromDevice, { ...existing, ratchet: serializeRatchet(st) });
      return JSON.parse(utf8Decode(pt)) as InnerMessage;
    } catch {
      return null;
    }
  }

  async wipe(): Promise<void> {
    try {
      await this.api('devices/' + this.deviceId + '/keys', 'DELETE');
    } catch { /* already gone */ }
    for (const k of ['identity', 'spks', 'opks', 'opkUsed']) {
      await this.kv.del(this.k(k));
    }
    this.readyDone = false;
    this.identity = null;
  }
}
