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
// v134 (2026-08-05): build v114 反映 — 香ペア消極的証拠(kyoNegAttackEvidence、既定OFF)。
//   Sonar訂正読み(香は強い駒なのでペアなら早出しする→出し渋りは非保有の消極的証拠)を
//   pairAttackEvidenceの統計的補集合として実装。A/B中立(49.83%、CI[48.81%,50.86%])のため既定OFF。
// v135 (2026-08-05): build v115 反映 — 香深堀り提案A: KYO_R1_WAIT既定OFF化。段階0診断で成立率
//   0.27%・発火時-33.85点/候補(z=+7.61で受けが優位)と判明。mc:true A/B(16,772局)中立
//   (49.98%、CI[49.22%,50.73%])、発火局限定ペアードは受け優位を強く支持し既定OFF化を採用。
// v136 (2026-08-05): build v116 反映 — 香深堀り提案B: ledgerProbのpHold較正(LEDGER_CAL、既定OFF)。
//   Platt較正でECE改善(48-91%)を確認したが、しきい値近傍の「決め打ち事故率」が悪化(9.6%→11.3%)
//   したため計画の判定木に従い不採用。NULL等価性は害なしを確認済みで実験トグルとして温存。
// v137 (2026-08-05): build v117 反映 — 香深堀り提案2: 香の受け不能判定の確率化(KYO_UNBLOCK_P、既定OFF)。
//   段階0診断でmc:false時は的中率99%超・到達性も基準を大幅に上回ったが、mc:true時に的中率が
//   63%/50%へ崩壊(誤り率35-50%>>5%上限)。原因はledgerNoHoldの「パス=非保有」硬い証拠が
//   MC受け判断のもとで前提を崩される点(komaLedger共通の未知の限界)と特定。計画の事前登録基準
//   によりA/B未実施・既定OFFのまま実験トグルとして温存。freshSolverProbeは67,280回のプローブで
//   bit-for-bit不変を確認。
// v138 (2026-08-05): build v118 反映 — 香深堀り提案6 bit0: 証拠の硬さ階層の分離(相方保有ゲート・
//   「し」限定、既定OFF)。C-3診断でledgerNoHoldの汚染が本番の相方保有ゲートにも波及しうると判明、
//   ledgerBoundsにH1限定のminHard/maxHardを追加しhard枝を切替可能にした。全検証(NULL等価性・
//   freshSolverProbe 67,440プローブ不変・回帰0件)は合格したが、到達性診断で最終着手が
//   1件も変化しなかった(soft枝が100%救済していたため)。計画の判定木に従いA/B未実施・既定OFF。
// v139 (2026-08-05): build v119 反映 — 香深堀り提案6 bit1: ledgerProb下側枝のH1化(全駒種、既定OFF)。
//   到達性は良好(mc:false 566/1,000・mc:true 693/1,000)でbit0とは対照的に本番決定へ実際に波及。
//   精度診断でH3除去がpHold/pAny点推定を統計的に有意に劣化させると確定(McNemar、4条件全てp<0.001)
//   したが、mixed-engine A/B(mc:false段)は51.15%(95%CI [49.37%,52.93%])で有意差なし。
//   Opus5の事前登録停止則(有意差なし→mc:true段未実施)に従いA/B途中終結・既定OFFのまま納品。
// v140 (2026-08-05): build v120 反映 — 香深堀り提案6 bit2: sampleWorldCのH1化(全駒種)。
//   真世界排除率が統計的に有意に改善(mc:true 10.14%→0.00%、McNemar p=6.5e-71)、フォールバック率
//   増加なし、NPS差-0.85%、mixed-engine A/Bはmc:false/mc:trueとも有意な悪化なし。計画の受け入れ
//   基準(精度改善+有意な悪化なしなら既定ON可)を満たし、このシリーズ初の既定ON化
//   (LEDGER_POLICY_EVID 0→4、LEDGER_POLICY_KOMA "shi"→"all")。bit0/bit1は既定OFFのまま。
// v141 (2026-08-06): build v121 反映 — 提案1: 決定化サンプラーの統合(SAMPLER_UNIFY)段階1、
//   不採用で終結。根pick変化率23.89%と到達性は良好、不可能世界サンプル率もoff0.021%→on0.000%
//   と構造的に改善したが、主指標のA-2a完全一致率・A-2b周辺MAEがいずれも有意に悪化
//   (t=-2.17/t=3.90)、NPS低下27.82%も許容超過。Opus5判定: sampleWorldWの重みは提案分布の比を
//   含まないため差し替えは事後分布そのものの置換になり、bit2既定ON後は追加できる情報が
//   H1境界(効果上界0.021%)のみで割に合わない。事前登録判定木のD分岐により既定OFFの実験
//   トグルとして残置、段階2(攻め伏せMC)は恒久的に取り下げ。
// v142 (2026-08-06): build v122 反映 — SAMPLER_BURY_FIX: sampleWorldの伏せ廃棄重み(BURY_PRIOR)を
//   nDis(伏せ回数、実測で0〜6の可変値と判明)で層別し実測値へ較正、既定ON。単一プール重みでは
//   nDis=1層とnDis>=2層が誤差を相殺しあう「層間の打ち消し合い」が生じたため2群独立較正
//   (L2縮小shrinkage・ガードレールクリップ[0.5,2.0]併用)。holdout残存比は全層50%未満、
//   ノイズ床診断・対応付きブートストラップ改善量診断のいずれも良好。方式B(サンプラー
//   アルゴリズム置換)はnDis=1で逐次性が数学的にゼロなため無効と判定し棄却。mixed-engine A/Bは
//   レビュー指摘(非ペア設計・停止則未遵守)を受けペア化ハーネスに修正し9,000局まで延長再実施
//   (同一配牌シード対・n=615対・9,096局)、新エンジン勝率50.42%(95%CI [49.39%,51.45%])で有意差なし。
// v143 (2026-08-06): build v122 コメント更新のみ(コード変更なし) — 再レビュー(承認・Must-fixなし)
//   の指摘2件を反映。(1) ペア化A/Bの単位定義を実装レポートに明文化: ペア化単位は勝負レベル
//   (615対=1,230勝負、約7.4局/勝負)であり、「局あたり得点差」は各勝負の(新チーム最終得点−
//   旧チーム最終得点)/局数を先に勝負単位で正規化し、同一シードの2アサインメント平均を対の
//   代表値として対応ありt検定にかけた2段階集約値であることを明記。(2) 本コメント自体の
//   CACHE_NAME繰上げ。BURY_FIX_MODE既定1(較正ON)を維持したままデプロイ可。
// v144 (2026-08-06): build v144 反映 — T1(最強AI)重みチェックポイント更新(Sonar提供の
//   t1_weights.js、sha256全文27dacc92bd89379f...)。データのみ差替、スキーマ完全一致・
//   エンジン/アダプタ無変更。自己対戦A/B(duplicate pairing、全4席T1・1,338対=2,676局)
//   で新チェックポイント勝率51.9%(95%CI[50.0%,53.8%]、z=1.97で有意)、winrate-neutral-
//   or-better基準を達成。
// v145 (2026-08-06): build v145 反映 — 「AI: 対人協調(coop)」ティアのUI削除(Sonar依頼、
//   goita-dev-loop Planner=Fable5/Executor=Sonnet5、Sonar裁定「案B: UIの選択肢だけ削除」)。
//   席構成セレクト3箇所のcoop選択肢を削除、cfg-N既定をstrongに変更、TIER_LABELからcoop削除、
//   LADDER_PRESETS(beginner/practice/tournament)の北席既定をcoop→strongに変更(探索設定は
//   coopとstrong同一のため強さ不変)。旧保存対局のtiers="coop"はresumeSavedMatchでstrongへ
//   正規化。COOP_SIGNAL/coopContext/G_Bブロック本体/honestSignalFilterはコード無変更で存置。
const CACHE_NAME = "goita-v145";

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
