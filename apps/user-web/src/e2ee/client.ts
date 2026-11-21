// E5: web E2EE client facade over E2eeStore. One instance per login
// (userId + server-issued deviceId); IndexedDB holds the keys.
import type { Chat, Message } from '../../../shared/api';
import { E2eeStore, MemoryKV, type ApiFn, type InnerMessage, type KeyValue, type RoomRef } from './store.js';
import { IndexedDbKV } from './idb.js';

let current: E2eeClient | null = null;

export interface Sendable {
  kind: string;
  body: string;
}

export class E2eeClient {
  readonly store: E2eeStore;
  readonly userId: string;
  readonly deviceId: string;
  private pending = new Set<string>();

  constructor(api: ApiFn, userId: string, deviceId: string, kv?: KeyValue) {
    this.userId = userId;
    this.deviceId = deviceId;
    this.store = new E2eeStore({ kv: kv || new IndexedDbKV(), api, userId, deviceId });
  }

  private refOf(room: Chat): RoomRef {
    return {
      id: room.id,
      kind: room.kind,
      memberIds: (room.members || []).map((m) => m.id).filter(Boolean),
      e2ee: !!room.e2ee,
    };
  }

  /** Encrypt an outbound message, or pass plaintext rooms through. */
  async encryptOutbound(room: Chat, kind: string, body: string, meta?: Record<string, unknown>): Promise<Sendable> {
    if (!room.e2ee) return { kind, body };
    const ref = this.refOf(room);
    if (!ref.memberIds.length) throw new Error('E2EE_NO_MEMBERS');
    const ct = await this.store.encryptRoom(ref, { kind, body, ...(meta ? { meta } : {}) });
    return { kind: 'ciphertext', body: ct };
  }

  /** Decrypt ciphertext messages in place; failures keep a flag for the UI. */
  async decryptInto(roomId: string, messages: Message[]): Promise<boolean> {
    void roomId;
    let changed = await this.decryptList(messages);
    // Reply previews of E2EE messages would show ciphertext: re-derive
    // them from the decrypted bodies in this same batch.
    const byId = new Map(messages.map((m) => [m.id, m]));
    for (const m of messages) {
      if (!m.reply_to || !m.reply_preview) continue;
      const orig = byId.get(m.reply_to);
      if (orig && orig._e2ee && m.reply_preview.body !== orig.body.slice(0, 80)) {
        m.reply_preview = { ...m.reply_preview, kind: orig.kind, body: orig.body.slice(0, 80) };
        changed = true;
      }
    }
    return changed;
  }

  private async decryptList(messages: Message[]): Promise<boolean> {
    let changed = false;
    for (const m of messages) {
      if (m.kind !== 'ciphertext' || m._e2ee || m._e2eeError || this.pending.has(m.id)) continue;
      if (!m.body || m.unsent) continue;
      this.pending.add(m.id);
      try {
        const open = await this.store.decryptBody(m.sender_id, m.body);
        if (open) {
          (m as unknown as Record<string, unknown>)._ct = m.body;
          m.kind = open.kind;
          m.body = open.body;
          if (open.meta && typeof open.meta === 'object') {
            m.metadata = { ...(m.metadata || {}), ...(open.meta as Record<string, unknown>) };
          }
          m._e2ee = true;
          changed = true;
        } else {
          m._e2eeError = true;
          changed = true;
        }
      } catch {
        m._e2eeError = true;
        changed = true;
      } finally {
        this.pending.delete(m.id);
      }
    }
    return changed;
  }

  /** Decrypt chat-list previews in place (best effort). */
  async decryptPreviews(chats: Chat[]): Promise<boolean> {
    let changed = false;
    for (const c of chats) {
      const last = c.last_message;
      if (!c.e2ee || !last || last.kind !== 'ciphertext') continue;
      try {
        const open = await this.store.decryptBody(last.sender_id, last.body);
        if (open) {
          last.kind = open.kind;
          last.body = open.body.slice(0, 120);
          changed = true;
        }
      } catch { /* preview stays opaque */ }
    }
    return changed;
  }

  /** Plaintext of a message for forward/edit (decrypted cache or raw body). */
  readableBody(m: Message): { kind: string; body: string } | null {
    if (m._e2eeError) return null;
    if (m.kind === 'ciphertext' && !m._e2ee) return null;
    return { kind: m.kind, body: m.body };
  }

  async reset(): Promise<void> {
    await this.store.wipe();
  }
}

export function getE2ee(api: ApiFn, userId: string, deviceId: string, kv?: KeyValue): E2eeClient {
  if (!current || current.userId !== userId || current.deviceId !== deviceId) {
    current = new E2eeClient(api, userId, deviceId, kv);
  }
  return current;
}

export async function resetE2ee(): Promise<void> {
  if (current) {
    const c = current;
    current = null;
    await c.reset();
  }
}

export { MemoryKV };
export type { InnerMessage };
