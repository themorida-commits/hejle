// حجله — سرویس‌ورکر محافظه‌کار: فقط دارایی‌های استاتیک هم‌مبدأ کش می‌شوند.
// دادهٔ زنده (Supabase و هر مسیر API) همیشه از شبکه می‌آید و هرگز کش نمی‌شود.
const CACHE = 'hejleh-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase و بقیه: دست نزن

  if (request.mode === 'navigate') {
    // ناوبری: اول شبکه، هنگام آفلاین نسخهٔ کش‌شدهٔ پوسته
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // دارایی‌های استاتیک (هش‌دار): اول کش، بعد شبکه و ذخیره
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});
