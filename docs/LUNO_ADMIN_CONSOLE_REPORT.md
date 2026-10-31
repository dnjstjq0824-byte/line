# LUNO Admin & Ecosystem Consoles Report

## 1. Multi-Console Suite (`apps/*-console`)
1. **Admin Console (`/admin/`)**: Real-time system metrics (`/api/v1/admin/stats`), user state enforcement (`warn`, `suspend`, `activate`), abuse report moderation, global feature flags (`PUT /api/v1/admin/feature-flags`), and immutable audit logs (`/api/v1/admin/audit-logs`).
2. **Partner Console (`/partner/`)**: Official Account creation, broadcast messaging, auto-reply rules, and rich menu configuration.
3. **Developer Console (`/developer/`)**: OAuth apps, bot webhook endpoints, and API token management.
4. **Creator Console (`/creator/`)**: Sticker pack submission and revenue settlement dashboard.
5. **Ads Console (`/ads/`)**: Campaign creation, budget management, and impression analytics.
