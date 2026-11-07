// 英単語クイズのオフライン用 service worker
// ・アプリ本体（index.html など）：まずネットから最新を取り（4秒まで）、だめなら端末に保存した版
//   → HTML を直して push すれば、次に開いたときに反映される（このファイルを変えなくてよい）
// ・Firebase のプログラム（gstatic、URLに版番号入り）：端末に保存したものを使う
// ・Firestore との通信（単語・記録の同期）：触らない
// このファイル自体を直したときは VERSION を変える（古い保存分が消えて入れ替わる）
const VERSION = "2026-11-07";
const CACHE = "vocab-quiz-" + VERSION;
const SDK = [
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js",
  "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js"
];
const FILES = ["./", "./index.html", "./manifest.json", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all([
    c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))),
    c.addAll(SDK.map(u => new Request(u, { mode: "cors" })))
  ])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("vocab-quiz-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req.url, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate";
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([
        fetch(req.url, { cache: "no-cache", credentials: "same-origin" }),
        new Promise((_, ng) => setTimeout(() => ng(new Error("timeout")), 4000))
      ]);
      if (res.ok) cache.put(isPage ? "./index.html" : req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(isPage ? "./index.html" : req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
