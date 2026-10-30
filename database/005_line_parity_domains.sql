-- Migration 005: LINE Parity Domains (Notes, Events/RSVP, Stories, VOOM, Wallet/LINE Pay)
CREATE TABLE IF NOT EXISTS chat.notes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id UUID NOT NULL REFERENCES chat.conversations(id),
 author_id UUID NOT NULL REFERENCES identity.users(id),
 body TEXT NOT NULL,
 likes INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 conversation_id UUID NOT NULL REFERENCES chat.conversations(id),
 title TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '',
 created_by UUID NOT NULL REFERENCES identity.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.event_rsvps (
 event_id UUID NOT NULL REFERENCES chat.events(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES identity.users(id),
 status TEXT NOT NULL CHECK(status IN ('going','maybe','declined')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(event_id,user_id)
);

CREATE TABLE IF NOT EXISTS community.stories (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES identity.users(id),
 text TEXT NOT NULL,
 bg TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#06C755,#00B900)',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community.voom_posts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id UUID NOT NULL REFERENCES identity.users(id),
 body TEXT NOT NULL,
 media_emoji TEXT NOT NULL DEFAULT '🎬',
 media_bg TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#0f172a,#1e293b)',
 tags JSONB NOT NULL DEFAULT '[]'::jsonb,
 likes INT NOT NULL DEFAULT 0,
 shares INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community.voom_likes (
 post_id UUID NOT NULL REFERENCES community.voom_posts(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES identity.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(post_id,user_id)
);

CREATE TABLE IF NOT EXISTS community.voom_comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id UUID NOT NULL REFERENCES community.voom_posts(id) ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES identity.users(id),
 text TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.wallets (
 user_id UUID PRIMARY KEY REFERENCES identity.users(id),
 balance BIGINT NOT NULL DEFAULT 125000,
 points BIGINT NOT NULL DEFAULT 3450,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commerce.wallet_transactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES identity.users(id),
 kind TEXT NOT NULL CHECK(kind IN ('in','out')),
 title TEXT NOT NULL,
 amount BIGINT NOT NULL,
 counterpart_id UUID REFERENCES identity.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
