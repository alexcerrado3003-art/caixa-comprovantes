/* Service worker: funciona offline, atualiza o app e recebe comprovantes compartilhados de outros apps. */
const V = 'cc-v1';
const SHELL = ['./', 'index.html', 'parser.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = /^(https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com))\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== 'cc-cdn' && k !== 'share-inbox').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);

  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const cache = await caches.open('share-inbox');
        const files = fd.getAll('files').filter(f => f && typeof f !== 'string');
        let i = 0;
        for (const f of files) {
          await cache.put(new URL('share/' + Date.now() + '-' + (i++), self.registration.scope).href,
            new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream', 'x-name': encodeURIComponent(f.name || 'comprovante') } }));
        }
        const t = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join('\n');
        if (t && !files.length) await cache.put(new URL('share/text', self.registration.scope).href, new Response(t));
      } catch (err) { /* abre o app mesmo assim */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  if (CDN.test(req.url)) {
    e.respondWith(caches.open('cc-cdn').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
