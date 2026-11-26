// lunotalk.com relay (main Cloudflare account, dnjstjq0824).
//
// Forwards apex + subdomains (web / api / ws / cdn) to the LUNO origin worker
// unchanged, preserving WebSocket upgrades, request bodies, Origin, and visitor
// Geo-IP country (`X-Luno-Country`) plus `X-Forwarded-Host`.
// www.lunotalk.com permanently redirects (301) to the apex domain.
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
    // Preserve visitor country before the subrequest geolocates to the relay POP.
    const country = request.cf && request.cf.country;
    if (country) forwarded.headers.set('X-Luno-Country', String(country));
    else forwarded.headers.delete('X-Luno-Country');
    return fetch(forwarded, { redirect: 'manual' });
  },
};
