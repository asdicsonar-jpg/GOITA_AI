// goita-app service worker
// 戦略: PLAN_deploy_v84.md に準拠
//   - index.html / ナビゲーションは network-first + cache fallback (更新が届かない事故を防ぐ)
//   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com) の GET のみ stale-while-revalidate
//   - それ以外の cross-origin リクエストは一切触らない(素通し)
//   - activate 時に旧 goita-* キャッシュを削除
//   - skipWaiting() は使わない(対局中の新SW切り替え事故を防止。次回起動時に反映)
//
// 更新時の運用: HTMLを更新するたびに CACHE_NAME を必ずインクリメントすること。

const CACHE_NAME = "goita-v87";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // 個別に addAll すると1件の失敗で全体が失敗するため、可能な限り耐性を持たせる
        await Promise.all(
          PRECACHE_URLS.map(async (url) => {
            try {
              await cache.add(url);
            } catch (e) {
              // 1リソースの取得失敗でinstall全体を失敗させない
            }
          })
        );
      } catch (e) {
        // プリキャッシュに失敗してもSW自体のインストールは継続させる
      }
    })()
  );
  // skipWaiting() は意図的に呼ばない
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("goita-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      } catch (e) {
        // 削除失敗は無視(次回activateで再試行される)
      }
      try {
        if (self.clients && self.clients.claim) {
          await self.clients.claim();
        }
      } catch (e) {
        // ignore
      }
    })()
  );
});

// index.html / ナビゲーションリクエスト: network-first + cache fallback
async function networkFirstHTML(request) {
  try {
    const fresh = await fetch(request);
    try {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
    } catch (e) {
      // キャッシュ書き込み失敗は致命的ではない
    }
    return fresh;
  } catch (e) {
    // オフライン等: キャッシュへフォールバック
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached =
        (await cache.match(request)) ||
        (await cache.match("./index.html")) ||
        (await cache.match("./"));
      if (cached) return cached;
    } catch (e2) {
      // ignore
    }
    throw e;
  }
}

// Google Fonts: stale-while-revalidate
async function staleWhileRevalidateFont(request) {
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch (e) {
    // キャッシュが開けない場合はネットワークへそのまま委ねる
    return fetch(request);
  }

  const cached = await cache.match(request).catch(() => undefined);

  const networkFetch = fetch(request)
    .then((response) => {
      try {
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // キャッシュを即返しつつ、裏で更新(結果は次回以降に反映)
    networkFetch;
    return cached;
  }

  const network = await networkFetch;
  if (network) return network;

  // キャッシュもネットワークも無い場合は失敗させる(呼び出し側でcatch)
  throw new Error("font fetch failed and no cache available");
}

self.addEventListener("fetch", (event) => {
  try {
    const request = event.request;

    // GET以外は素通し(POST等をキャッシュ層で扱わない)
    if (request.method !== "GET") return;

    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return; // 解析できないリクエストは素通し
    }

    const isSameOrigin = url.origin === self.location.origin;

    if (isSameOrigin) {
      // 同一オリジンのナビゲーション/index.html は network-first
      const isNavigation = request.mode === "navigate";
      const path = url.pathname;
      const isIndexHtml =
        path.endsWith("/index.html") ||
        path === "/" ||
        path.endsWith("/");

      if (isNavigation || isIndexHtml) {
        event.respondWith(networkFirstHTML(request));
        return;
      }

      // その他の同一オリジン資産(manifest.json/アイコン等)はキャッシュ優先→ネットワーク
      event.respondWith(
        (async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached) return cached;
            const fresh = await fetch(request);
            try {
              cache.put(request, fresh.clone());
            } catch (e) {
              // ignore
            }
            return fresh;
          } catch (e) {
            return fetch(request);
          }
        })()
      );
      return;
    }

    // cross-origin: Google Fonts のみ対象
    if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
      event.respondWith(
        staleWhileRevalidateFont(request).catch(() => fetch(request))
      );
      return;
    }

    // それ以外のcross-origin(外部リンク等)はSWで一切触らない
    return;
  } catch (e) {
    // fetchハンドラ内の想定外エラーはネットワークへの素通しに委ねる(respondWithしない)
    return;
  }
});
