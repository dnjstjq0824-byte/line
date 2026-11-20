// lunotalk.com relay (main Cloudflare account, dnjstjq0824).
//
// The domain lives in the main account; the LUNO server (Worker + D1 + R2 +
// Durable Objects) still lives in the older dnjstjqppk account. Until the
// server itself moves, this relay forwards every request to it unchanged,
// including WebSocket upgrades, request bodies and the browser's Origin
// (the server allowlists https://lunotalk.com in ALLOWED_ORIGINS).
//
// www.lunotalk.com permanently redirects to the apex.
const UPSTREAM = 'https://luno-messenger.dnjstjqppk.workers.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.hostname === 'www.lunotalk.com') {
      url.hostname = 'lunotalk.com';
      return Response.redirect(url.toString(), 301);
    }
    const target = UPSTREAM + url.pathname + url.search;
    const forwarded = new Request(target, request);
    forwarded.headers.set('X-Forwarded-Host', url.hostname);
    forwarded.headers.set('X-Forwarded-Proto', 'https');
    // The server picks the front-page language by country; its own view of
    // this subrequest would geolocate to the relay's data centre.
    const country = request.cf && request.cf.country
    if (country) forwarded.headers.set('X-Luno-Country', String(country))
    else forwarded.headers.delete('X-Luno-Country')
    return fetch(forwarded, { redirect: 'manual' });
  },
};
