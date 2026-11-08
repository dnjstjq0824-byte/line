# Responsive Standard (P0)

Web (`apps/user-web`) and app (`mobile/flutter_app`) share one breakpoint scale.
Enforced by `scripts/responsive_breakpoints.test.mjs`.

## Breakpoints

| Band | Width | Layout |
|---|---|---|
| phone | ≤700px | single column, bottom/floating nav |
| tablet | 701–1100px | side pane + chat, icon rail |
| desktop | >1100px | full 3-pane |

Refinements (no layout flips, tweaks only):

- ≤480px: small-phone type/bubble/padding tweaks.
- 701–1000px: tablet-narrow padding/topbar wrap tweaks.

Rules:

- Layout flips ONLY at 700 and 1100. Never add 768 — it reopens the
  701–768 zone where phone rules (fixed fullscreen chat, bottom rail) and
  tablet rules (row workspace, side pane) fought.
- Touch targets ≥44px. Honor `safe-area-inset-*` on bottom-docked UI.
- Landscape phones land in tablet band; layouts must survive short heights.
- Font scale 100–130% must not break layout. Light + dark both verified.
- Consoles (`admin/partner/developer/creator/ads`) are PC-only, out of scope.

## Token files (user-web import order in `main.ts`)

1. `components/luno-design-tokens.css` — `--line-*` legacy vars + shared components.
2. `luno-theme.css`, `luno-theme-advanced.css` — theme layers.
3. `styles/luno-design-tokens.css` — `--luno-*` brand vars, dark mode, font scale.
4. `shared/design-v3.css` — canonical cross-platform tokens (parity-tested).
5. `styles/luno-v2.css` — v2 overrides, loads last and wins.

`--line-*` and `--luno-*` are separate live namespaces; do not merge by hand.
`design-v3.*` is pinned by `design_tokens_parity.test.mjs` — keep in sync.

## Verification matrix (Phase 4)

PC 1440/1920 · tablet 768/1024 portrait+landscape · phone 360/390/430 · light/dark.
Web via headless browser, app via emulator.
