const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-9(v92a, PLAN_v92_consistency.md): 振り返り系MC評価(clarityAnalyze/mcReevaluate)のmcDets・seedを
// 共通化する(最小差分。candidateRanking/aiHesitationは対象外)。両者ともmcDetsは元々24で一致していたが、
// mcSeedの式がclarityAnalyze=gameNo*131+i、mcReevaluate=gameNo*977+iと別々だったため、同一局面の
// 「際どさ」判定が経路によって揺れうる構造上の不統一があった。G.mcEvalReceiveへ渡すopts自体を
// スパイして観測し、両関数が同一のmcDets/mcSeedで呼び出すことを確認する。

function playSequence(G, initialHands, parent, actions) {
  const st = G.newGameState(initialHands, parent);
  const moves = [];
  for (const a of actions) {
    const seat = st.actor;
    const ev = G.advance(st, a);
    moves.push({seat, human: false, action: {type: a.type, koma: a.koma || null}});
    if (ev.gameOver) throw new Error("Unexpected game-over during fixture construction: " + JSON.stringify(ev.gameOver));
  }
  return moves;
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const app = T.app;
  const G = T.G;

  // N attack金 -> W pass -> S(respond, human)。moves[3]は決定点そのもの(rebuildStateではreplayされない
  // ため実際の中身は問わない。human/forced/action.typeだけがclarityAnalyzeのフィルタ対象になる)。
  const initialHands = {
    N: ["金", "馬", "角", "飛", "王", "銀", "香", "し"],
    W: ["角"],
    S: ["角", "銀", "飛", "香", "し", "し", "し", "王"],
    E: ["角"],
  };
  const actions = [
    {type: "bury", koma: "し"}, {type: "attack", koma: "金"},   // N
    {type: "pass"},                                              // W
  ];
  const moves = playSequence(G, initialHands, "N", actions);
  moves.push({seat: "S", human: true, action: {type: "pass", koma: null}});   // idx=3: 対象の決定点
  const rec = {gameNo: 7, matchNo: 1, parent: "N", initialHands, scoresBefore: {NS: 0, EW: 0}, moves, result: null, eqCurve: null};

  app.reviewRec = rec;

  const calls = [];
  const origMc = G.mcEvalReceive;
  G.mcEvalReceive = function (st, seat, opts) {
    calls.push({seat, opts});
    return origMc.call(G, st, seat, opts);
  };

  try {
    // ---- (a) mcReevaluate(3) の呼び出しopts ----
    T.mcReevaluate(3);
    await wait(80);
    assert.strictEqual(calls.length, 1, "mcReevaluateが1回G.mcEvalReceiveを呼ぶ: " + calls.length);
    const mcCall = calls[0];
    calls.length = 0;

    // ---- (b) clarityAnalyze() の呼び出しopts(対象moveは1件のみ) ----
    T.clarityAnalyze(true);
    await wait(150);
    assert.strictEqual(calls.length, 1, "clarityAnalyzeが1回G.mcEvalReceiveを呼ぶ(対象move1件): " + calls.length);
    const claCall = calls[0];

    assert.strictEqual(mcCall.opts.mcDets, 24, "mcReevaluateのdetsは24(既存値のまま・回帰なし)");
    assert.strictEqual(claCall.opts.mcDets, mcCall.opts.mcDets,
      "mcDetsがmcReevaluateとclarityAnalyzeで一致する: " + JSON.stringify([mcCall.opts, claCall.opts]));
    assert.strictEqual(claCall.opts.mcSeed, mcCall.opts.mcSeed,
      "mcSeedもmcReevaluateとclarityAnalyzeで一致する(M-9・共通化前はgameNo*131+iとgameNo*977+iで別だった): " +
      JSON.stringify([mcCall.opts, claCall.opts]));
    console.log("PASS (a)+(b): mcReevaluateとclarityAnalyzeが同一のmcDets/mcSeedでG.mcEvalReceiveを呼ぶ(M-9)");
  } finally {
    G.mcEvalReceive = origMc;
  }

  console.log("ALL v92 CLARITY TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
