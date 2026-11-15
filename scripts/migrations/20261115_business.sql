-- F17 business consoles: D1 tables behind DURABLE_BUSINESS.
-- Local/staging preparation only. Production application requires separate PO approval.
-- Additive: CREATE TABLE IF NOT EXISTS, no existing data touched.
CREATE TABLE IF NOT EXISTS luno_partner_orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, country TEXT NOT NULL DEFAULT 'KR',
  owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_partner_accounts (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_partner_tickets (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, contact_id TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal', note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_partner_campaigns (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, name TEXT NOT NULL,
  template_json TEXT NOT NULL DEFAULT 'null', status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_partner_coupons (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, code TEXT NOT NULL,
  max_redemptions INTEGER NOT NULL DEFAULT 50, redeemed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_rich_menus (
  account_id TEXT PRIMARY KEY, menu_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_oa_bot_rules (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, keywords_json TEXT NOT NULL,
  reply TEXT NOT NULL, match_type TEXT NOT NULL DEFAULT 'contains', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_dev_orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_dev_apps (
  id TEXT PRIMARY KEY, org_id TEXT, owner_id TEXT NOT NULL, name TEXT NOT NULL,
  client_id TEXT NOT NULL, client_secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_dev_webhooks (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, endpoint_url TEXT NOT NULL,
  secret_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_dev_miniapps (
  id TEXT PRIMARY KEY, app_id TEXT NOT NULL, origin TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_creator_profiles (
  user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_creator_items (
  id TEXT PRIMARY KEY, pack_id TEXT NOT NULL, object_key TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'static', ordinal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_ads_advertisers (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL DEFAULT '', name TEXT NOT NULL,
  owner_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS luno_ads_groups (
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, name TEXT NOT NULL,
  targeting_json TEXT NOT NULL DEFAULT '{}', bid_minor INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
