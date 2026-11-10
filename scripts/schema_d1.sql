-- LUNO Messenger D1 Relational Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  handle TEXT UNIQUE NOT NULL,
  birthday TEXT DEFAULT '',
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
  updated_at TEXT NOT NULL,
  owner_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  last_read_message_id TEXT DEFAULT '',
  joined_at TEXT NOT NULL,
  is_pinned INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  is_hidden INTEGER DEFAULT 0,
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
  is_favorite INTEGER DEFAULT 0,
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
  created_at TEXT NOT NULL,
  multiple INTEGER DEFAULT 0,
  closed INTEGER DEFAULT 0,
  created_by TEXT DEFAULT '',
  options_json TEXT DEFAULT '[]'
);
