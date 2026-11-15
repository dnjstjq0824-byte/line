// F19: static-asset security headers for dist_cf/_headers (Cloudflare
// serves assets + the SPA fallback without invoking the worker, so
// withSecurityHeaders() never sees them). Must stay identical to the HTML
// branch of withSecurityHeaders() in scripts/cf_worker.js.
const fs = require('fs');
const path = require('path');

const HTML_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";
const REFERRER_POLICY = 'strict-origin-when-cross-origin';

function headersFileText() {
  // One /* rule: SPA routes (/login, /chats, ...) carry no .html suffix,
  // so suffix-scoped rules would miss them. _headers only affects static
  // assets (API responses keep the worker policy); a document CSP on
  // subresources is inert but harmless.
  return `/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: ${HTML_CSP}
  Referrer-Policy: ${REFERRER_POLICY}
`;
}

function writeHeadersFile(distRoot) {
  fs.writeFileSync(path.join(distRoot, '_headers'), headersFileText(), 'utf8');
}

module.exports = { HTML_CSP, REFERRER_POLICY, headersFileText, writeHeadersFile };
