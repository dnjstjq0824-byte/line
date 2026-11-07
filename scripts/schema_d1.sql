-- LINE Messenger D1 Relational Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  status_message TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  state TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL, -- 'direct' | 'group' | 'official' | 'openchat'
  title TEXT NOT NULL,
  avatar_url TEXT DEFAULT '',
  official INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  last_read_message_id TEXT DEFAULT '',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT DEFAULT 'text', -- 'text' | 'sticker' | 'image' | 'file' | 'audio' | 'system'
  media_url TEXT DEFAULT '',
  sticker_id TEXT DEFAULT '',
  reply_to_id TEXT DEFAULT '',
  is_pinned INTEGER DEFAULT 0,
  is_unsent INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS friends (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT DEFAULT 'accepted',
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keep_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT DEFAULT 'text',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS openchat_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  cover_url TEXT DEFAULT '',
  member_count INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  image_urls TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  location TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  question TEXT NOT NULL,
  option1 TEXT NOT NULL,
  option2 TEXT NOT NULL,
  votes1 INTEGER DEFAULT 0,
  votes2 INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Seed initial test users and official accounts if not present
INSERT OR IGNORE INTO users (id, email, password_hash, display_name, status_message, bio, created_at, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'user@line.local', 'sha256:LineUser#2026!', 'LINE Demo User', '오늘도 행복한 하루 🍀', 'LINE 공식 데모 계정입니다.', datetime('now'), datetime('now')),
  ('00000000-0000-0000-0000-000000000002', 'admin@line.local', 'sha256:LineAdmin#2026!', 'LINE Admin', '메신저 시스템 관리자 🛡️', 'System Administrator', datetime('now'), datetime('now')),
  ('00000000-0000-0000-0000-000000000003', 'alice@line-test.local', 'sha256:AliceStrongPass#2026', 'Alice Kim', '커피 한 잔의 여유 ☕', 'Developer & Designer', datetime('now'), datetime('now')),
  ('00000000-0000-0000-0000-000000000004', 'bob@line-test.local', 'sha256:BobStrongPass#2026', 'Bob Lee', '열심히 코딩 중 💻', 'Software Engineer', datetime('now'), datetime('now'));

INSERT OR IGNORE INTO wallets (user_id, balance, updated_at)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 250000, datetime('now')),
  ('00000000-0000-0000-0000-000000000003', 180000, datetime('now')),
  ('00000000-0000-0000-0000-000000000004', 90000, datetime('now'));

INSERT OR IGNORE INTO friends (user_id, friend_id, status, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'accepted', datetime('now')),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'accepted', datetime('now'));

INSERT OR IGNORE INTO openchat_rooms (id, name, description, category, member_count, created_at)
VALUES
  ('oc_tech_01', '💻 개발자들의 대화방 (Tech & Code)', '프론트엔드/백엔드/인프라 기술 잡담 및 질의응답', 'it', 1284, datetime('now')),
  ('oc_crypto_02', '📈 글로벌 경제 & 재테크 토론', '국내외 주식, 암호화폐, 환율 실시간 정보 공유', 'finance', 3420, datetime('now')),
  ('oc_cafe_03', '☕ 전국 감성 카페 & 디저트 탐방', '주말 데이트 및 핫플레이스 카페 공유방', 'lifestyle', 890, datetime('now'));

