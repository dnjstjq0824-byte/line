# LUNO Performance & Bundle Optimization Report

## 1. Production Build Metrics (Vite 6.4.5)
- **`@messenger/user-web`**:
  - `dist/index.html`: 0.77 kB (gzip: 0.42 kB)
  - `dist/assets/index.css`: 104.63 kB (gzip: 18.74 kB)
  - `dist/assets/index.js`: 248.86 kB (gzip: 78.55 kB)
- **Console Workspaces (`admin`, `partner`, `developer`, `creator`, `ads`)**:
  - ~74–77 kB JS (~29–30 kB gzip) and ~0.8–1.3 kB CSS per console.
- **API Latency**:
  - Edge Worker / Durable Object P50 < 5ms, P99 < 25ms in local/staging benchmarks.
