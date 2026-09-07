// ごいた — Service Worker
// 対象: index.html (build v216, SHA-256 4a6857ce1348ae451d61536c9a4161b80ad33aa491ef342d29b180c6582807a3)
//
// v205: A-1「ddSolve の Packed 化(PACKED_SOLVE、既定0=legacy)」。出荷既定では1行も
// 実行されない基盤整備であり、着手列SHA-256 は v204 と完全一致することを機械確認済み。
// v206: A-2「レイテンシ予算の再配分(TEMPO_BUDGET、既定0)」。app層のみでエンジンは無変更、
// 既定0では v205 と完全NULL等価。1 でも着手列は変わらないことを実ブラウザ(観戦モード)で確認済み。
// v207: 振り返り画面のレイアウト崩れ修正(CSSのみ・JSは1行も変えていない)。タッチ端末で
// 手一覧の行が44pxに潰れて本文とボタンが重なる件、形勢グラフが全端末で潰れる件、
// 課題が無い局でも「60秒で解き直す」が出て押しても何も起きない件の3点。
// v208: 右上の版数バッジをボタン化し、押すと「更新内容」(前の版からの変更点)を表示する。
// 版数は APP_CHANGELOG の先頭から自動生成するので、以後 v198 のまま取り残されることはない。
// エンジン(G/G_B)は両ブロックとも v207 とバイト完全一致。
// v209: 相手の持ち駒推測(beliefMC 精緻化)を手駒8枚でも行う既定に変更(COUNT_BELIEF_MAXHAND 6→8)。
// 初手伏せ(証拠なし)は除外(COUNT_BELIEF_MINHIST=1 新設)。エンジン G/G_B の既定値・ゲート条件のみ。着手列は測定範囲で不変。
// v210: 相手の持ち駒推測(beliefMC)の pHold を制御変量つき推定量 cvs = clip(A + c_k + (W − U)) で書く既定に変更
//       (BELIEF_EST 新設・既定 "cvs"、setBeliefEst("") で v209 と同一)。推定の雑音分散 −41%、Brier −0.0016〜−0.0018。着手列は 1.6〜2.0% のマッチで分岐(得点は不変。v210 実装レポート rev.2 の実測は 1/150 マッチ — v213 で併記)。
// v211: 手駒 8 枚・敵攻めで規則が王切りする局面に限り、受け MC(dets 16)の対標本 z ≥ 1.64 なら王を温存して通す(RECV8_OU_VETO 新設・既定 1、
//       setRecv8OuVeto(0) / #recv8=0 で v210 と同一)。分岐あたり +5.04 点、h2h 600 ペア非劣性 PASS、4 席合計で 25 局に 1 回。
// v212: 相方の「なし」の読み(王温存バケットの λ)を手駒 8 枚で分けて v211 の打ち筋に合わせて較正(OUK_H8 新設・既定 1、
//       setOukH8(0) / #oukh8=0 で v211 と同一)。打ち筋は直接変えない。h2h 600 ペア非劣性 PASS。
// v212.1: UI-1(局面コード / パス履歴 / 観戦時の手駒公開)。UI 層のみ・エンジン G/G_B/T1 は v212 と byte 同一。新設定 2 つは既定 OFF。
// v213: v212.1 以前の build ヘッダ 115 本を index.html から docs/BUILD_HISTORY_index.md へ外出し(gzip −111 KB)。エンジン G/G_B は v212 / v212.1 とバイト同一。
// v214: 手駒 2 で敵の攻めを通した席の王温存 λ を実測(王あり・王切り経路で通し 0/2,176 機会)に合わせて床 0.05 に(OUK_H2 新設・既定 1、
//       setOukH2(0) / #oukh2=0 で v213 と同一)。手駒 {6,4}/{8} の λ は v213 と同一。
// v215: 手駒 {6,4} で敵の攻めを通した席の王温存 λ を v212 方策の実測(帯 L2)に合わせて較正(OUK_H6 新設・既定 1、setOukH6(0) / #oukh6=0 で v214 と同一)。
//       v214(OUK_H2)は未配信のまま本版に含む。手駒 {8}/{2} の λ は v214 と同一。
// v216: 台帳精緻化(相手の手の読みの詳細化)が、実効標本数の低さを理由に結果を捨てて粗い近似へ戻していた処理を撤廃
//       (既定 1、setCountBeliefMinEss(12) / #miness=12 で v215 と同一)。打ち筋の規則・王温存バケットの λ は v215 と同一。
//
// このファイルは index.html と同じディレクトリに配置すること。index.html 側は
// すでに以下の登録コードを持っている(http(s)配信時のみ有効。file://や未配置時は
// 静かに無視されるため、このファイルが無くてもゲーム自体は問題なく動く):
//
//   navigator.serviceWorker.register("sw.js")
//
// 【重要】次に index.html を更新して配信し直すときは、必ず CACHE_NAME の版数を
// 繰り上げること(例: goita-v207 → goita-v208)。繰り上げを忘れると、既にこの
// アプリを開いたことがある端末には古いキャッシュが残り続け、新しい index.html が
// 配信されない(PWAの典型的な事故)。

const CACHE_NAME = "goita-v216";

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
