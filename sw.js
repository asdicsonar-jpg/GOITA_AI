// ごいた — Service Worker
// 対象: index.html (build v204, SHA-256 673bb2db782aaad18fd382b786f0ef61c7f69bb0208e615ca0279f9afd3ab0e9)
//
// このファイルは index.html と同じディレクトリに配置すること。index.html 側は
// すでに以下の登録コードを持っている(http(s)配信時のみ有効。file://や未配置時は
// 静かに無視されるため、このファイルが無くてもゲーム自体は問題なく動く):
//
//   navigator.serviceWorker.register("sw.js")
//
// 【重要】次に index.html を更新して配信し直すときは、必ず CACHE_NAME の版数を
// 繰り上げること(例: goita-v204 → goita-v205)。繰り上げを忘れると、既にこの
// アプリを開いたことがある端末には古いキャッシュが残り続け、新しい index.html が
// 配信されない(PWAの典型的な事故)。

const CACHE_NAME = "goita-v204";

// 起動シェルとして必ずキャッシュしたいファイル。存在しないもの(まだ配置していない
// manifest.json やアイコン等)があっても install 全体を失敗させないよう、
// 1件ずつ catch して無視する。
const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.json",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting(); // 新しいSWをすぐ有効化(タブを閉じ直すのを待たない)
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {
          // 個別のファイルが404/未配置でも他のプリキャッシュは続行する
        }))
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim()) // 既存タブにもすぐ新しいSWを効かせる
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST等はSWを介さずそのまま通す

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Googleフォント等クロスオリジンのリソースはSWで肩代わりしない
    // (ブラウザの標準HTTPキャッシュに任せる)
    return;
  }

  // ページ本体(HTML)はネットワーク優先: 更新があれば即座に拾い、
  // オフライン時のみキャッシュへフォールバックする。
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("index.html"))
        )
    );
    return;
  }

  // それ以外の同一オリジン資産(manifest.json・アイコン等)はキャッシュ優先で
  // 即座に返しつつ、裏側でネットワーク取得してキャッシュを更新する
  // (stale-while-revalidate)。
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
