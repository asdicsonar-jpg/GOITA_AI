// ごいた — Service Worker
// 対象: index.html (build v220.8, SHA-256 6f8cd7fedd1b02564b7b8bb93c13d085962458d7b8cf0e9708d67369568024ed)
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
// v219: 終盤(総手駒 ≤ 16・手駒 ≤ 4)の攻めの DD-PIMC で、候補世界ごとに他席の履歴を規則方策で再生し観測との不一致数 k で 0.2^k の重みを付ける(v218 = 0.5^k は未配信)
//       (ATK_CONS_W 新設・既定 1、setAtkConsW(0) / #atkcons=0 で v216 と着手列が 1 手も変わらない)。対人席は表整合性の事後で減衰(setAtkConsTrust)。
// v219.2: UI-2（駒数の長押し表示 / 観戦の残り点 / プレイスタイル / 席の交換 / サマリー画像）＋ UI-3 第 1 便（開始画面 / 受けの助言 / 2 タップ確定 / タップ領域 / 自動振り返り既定 OFF）＋ 継ぎ目の修正（駒数の長押しを補助として揃える）。UI 層のみ・エンジン区画は v219 と byte 同一。v219.1 は未配信のまま本版に含む。
// v219.3: 席の呼び方を自分・相方・上家・下家に統一（観戦・サマリー画像・練習の帯・保存する棋譜も）。UI 層とマークアップのみ・エンジン区画は v219.2 と byte 同一。
// v219.4: 開始画面の「初心者向け・完全ガイド」を同じ位置で1行に折りたたみ（押すと今までどおり開く）。表示制御のみ・エンジン区画は v219.3 と byte 同一。
// v219.5: 対局プリセットの相手AIを一段ずつ上げ（はじめて＝標準AI・腕試し＝強いAI・大会仕様＝最強AI。大会仕様は相方も最強AI）、出場前チェックリストの勝ち越し判定を強いAI以上に広げた。設定値と表示のみ・エンジン区画は v219.4 と byte 同一。
// v220.0: し攻めコミット中に Solver の非確定プランや確定プランが別の駒(王攻め等)へ逸れる経路を条文で縛り、敵のし攻めで即刻中止し、コミット中の敵の非し攻めはし以外の駒で受ける(SHI_PROTO 既定2、setShiProto(0) / #shiproto=0 で v219.5 と着手列が同一)。
// v220.1: 相方のし攻めへの応じ方を条文どおりにし(初回応答はし枚数と受け幅で決め、自分もし攻めした後はしを受けに回さず通し、相方リーチのし攻めは自分に確定上がりが無ければ通す)、しを受けた直後の攻めを符丁の意味に合わせる(SHI_PROTO 既定2、setShiProto(2) / #shiproto=2 で v220.0 と着手列が同一)。
// v220.2: 相方がリーチでしで攻めてきたときは原則として相方に上がらせ(敵の誰かが残り2枚で上がりそうな時だけ自分が先取り。K-4)、自分に確定上がりが無ければ無条件に譲り、C-17 中止後の漏れとコミット中の余剰整理でのし伏せを直し、し受け直後はかかり応えよりしの符丁を優先する(SHI_PROTO 既定4、setShiProto(3) / #shiproto=3 で v220.1 と着手列が同一)。
// v220.3: 敵の し攻め中は自分の し が敵の残りより多くても温存して枯らし(Q6・C-13)、相方リーチの し攻めは確定でない Solver プランでは受けず(Q7・C-18末尾)、確定プランでは見えない駒からの分布で相方の上がり点を見積もり自分の方が高いと想定されるときは受けて上がり、そうでなければ譲る(同点は譲る)。ただし敵の誰かが残り 2 枚で上がりそうなときは、これまでどおり自分が先に受けて上がる(K-4。Q8・K-16)。SHI_PROTO 既定5、setShiProto(4) / #shiproto=4 で v220.2 と着手列が同一。
// v220.4: 自軍のし攻めコミット中は敵の残りしを枯らしの計数enemyShiRemainingで数え(起点はチームの1攻め目。Q9・C-09)、自分もしで攻めた後の相方のし攻めはし3枚以下なら確定プランでも例外(敵リーチ・確定点が最高点駒以上)のときだけ受ける(Q10・C-16一般化)。敵のしを受けて枯らしたら自軍からしで攻めに転じ(Q11・C-13逆し攻め)、敵のし攻め中の伏せは王を伏せない(Q12・C-10。裁定H-5・H-6)。読みヒントの表示は従来どおりの確率のまま(裁定H-1)。SHI_PROTO 既定6、setShiProto(5) / #shiproto=5 で v220.3 と着手列が同一。
// v220.5: 相方がリーチでしで攻めてきたときの応答は、C-07の門でなくC-18の点比較で確定上がりの可否を決める(Q14・裁定L-1)。敵のし攻め中の伏せで手駒がしと王だけならしを伏せる(Q15・裁定L-5)。自分もしで攻めた後の相方のし攻め(相方リーチでない)にし3枚以下で応答するときは、確定上がりの手順があれば受けて、その手順の攻めを打つ(次の攻め番からはC-07に戻る。Q17・裁定L-6・L-8)。SHI_PROTO 既定7、setShiProto(6) / #shiproto=6 で v220.4 と着手列が同一。
// v220.6: UI の不具合の直し（再開の乱数・対局中の棋譜・調整の保存・吹き出しとトーストの幅・残り駒表・詰めの成績の二重計上・未定義の CSS 変数・描画の無駄・表記・教材の開始と途中退出・初回の既定・読み込み中の開始ボタン）。エンジン区画は v220.5 と byte 一致。
// v220.7: 短い入門コース（3 場面・5 着手）と助言つきの 1 局練習を配信（apply_quickstart_v2.py・検討書 B7 の直しを含む）。エンジン区画は v220.6 と byte 一致。
// v220.8: 小さな直しと UI の整理（apply_v220_8.py）。本体の事前キャッシュを 1 本にし、成功した応答だけを保存。エンジン区画は v220.7 と byte 一致。
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

const CACHE_NAME = "goita-v220.8";

// 起動シェルとして必ずキャッシュしたいファイル。存在しないもの(まだ配置していない
// manifest.json やアイコン等)があっても install 全体を失敗させないよう、
// 1件ずつ catch して無視する。
// v220.8 F8-14（検討書 H3）: 本体は "./" の 1 本だけにする（"index.html" と二重に 9MB を持たない）
const PRECACHE_URLS = [
  "./",
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
    // v220.8 F8-14: 成功した応答（ok）だけを保存する。本体（スコープの直下・index.html・クエリ付き）は 1 つのキー（"./"）にそろえる
    const scope = new URL(self.registration.scope);
    const isShell = url.pathname === scope.pathname || url.pathname === scope.pathname + "index.html";
    const key = isShell ? scope.href : (url.origin + url.pathname);
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(key, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(key, {ignoreSearch: true}).then((cached) => cached || caches.match(scope.href))
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
