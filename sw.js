// goita-app service worker
// 戦略: PLAN_deploy_v84.md に準拠
//   - index.html / ナビゲーションは network-first + cache fallback (更新が届かない事故を防ぐ)
//   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com) の GET のみ stale-while-revalidate
//   - それ以外の cross-origin リクエストは一切触らない(素通し)
//   - activate 時に旧 goita-* キャッシュを削除
//   - skipWaiting() は使わない(対局中の新SW切り替え事故を防止。次回起動時に反映)
//
// 更新時の運用: HTMLを更新するたびに CACHE_NAME を必ずインクリメントすること。

// v120 (2026-07-26): build v100 反映 — T1(Neural Network)エンジン v7→v7s差替 + matchTarget配線。
// v121 (2026-07-26): build v101 反映 — T1ティア表示名変更(「Neural Network」→「NN＠oui2039」)。
// v122 (2026-07-26): build v102 反映 — 「遊び方」の符丁辞書節削除 + 最強AI注意書き追加。
// v123 (2026-07-26): build v103 反映 — T1(最強AI)重みチェックポイント更新(e32844d6-t1_weights.js)。
// v124 (2026-07-27): build v104 反映 — チュートリアルautoステップの自己ペース化(開始/終了ゲート)。
// v125 (2026-07-28): build v105 反映 — 王攻め伏せバグ修正(自席の伏せ王による王攻め解禁)。
// v126 (2026-08-04): build v106 反映 — 枚数読みレイヤー追加(段階0+1・可視化のみ、決定ロジック非接続)。
// v127 (2026-08-04): build v107 反映 — 枚数読みバグA修正(段階2、味方の攻めへのパスを否定証拠から除外)。
// v128 (2026-08-04): build v108 反映 — 枚数読み段階3(Solverの相方保有ゲート・第4局#30型の事故対策)。
// v129 (2026-08-04): build v109 反映 — 枚数読み段階4(sampleWorldC・受けMC決定化サンプラーの席帰属修正)。
// v130 (2026-08-04): build v110 反映 — 枚数読み段階5+6(占有率recvPの台帳化 + beliefMC融合)。
// v131 (2026-08-04): build v111 反映 — beliefMC内部サンプラーのsampleWorldC化 + noMC多重ネスト修正。
// v132 (2026-08-04): build v112 反映 — 味方の攻めを死に王で受け手番を奪う戦術(OU_TAKE_TURN、既定OFF)。
//   第3局#29型の分析(Opus5計画)。反実仮想診断(799候補)でhandLen<=4のみ弱い正の効果、既定は据え置き。
// v133 (2026-08-05): build v113 反映 — 王受け戦術を再計画・closed-form廃止しmcDecideReceiveの
//   margin判定に委譲(Opus5再計画)。#29直接再現(margin+0.084〜+0.125)を確認、既定ON化。
const CACHE_NAME = "goita-v133";

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
