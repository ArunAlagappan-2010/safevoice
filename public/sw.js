// Keeps the student app openable when the phone is off the SafeVoice Wi-Fi.
// Browsers only run this over https or on localhost; on plain http it is skipped
// and the in-page outbox still holds reports until the phone reconnects.
const CACHE = 'safevoice-v3';
const SHELL = [
  '/', '/base.css', '/student.css', '/student.js', '/logo.svg', '/manifest.webmanifest',
  '/icons/icon-192.png', '/fonts/inter-latin-400-normal.woff2', '/fonts/inter-latin-600-normal.woff2',
  '/fonts/source-serif-4-latin-700-normal.woff2', '/fonts/source-serif-4-latin-700-italic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== location.origin) return;
  // Network first so updates show straight away; cache when offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && SHELL.includes(url.pathname)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))),
  );
});
