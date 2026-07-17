const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-14(v92a, PLAN_v92_consistency.md): computeCoach の「同点別手順」救済分岐で、G.ddParAnalyze が
// 総駒>20 等で証明不能(ok:false)を返した場合、その手を miss に数えない(agree扱いにもしない)。
// cf.src を "solverUnverified"(非"solver")にすることで、⚠の正定義(rec.misses/coachSummary/
// eqPinMoves/buildConceptProfileいずれも src==="solver" の厳密一致)から自然に除外される。
// 既存の cf 表示(mv.cf.src==="solver" の厳密一致で分岐)が壊れないことも確認する。
//
// computeCoach は内部で G.freshSolverProbe / G.ddParAnalyze を(rebuildStateで再構成した)実局面に
// 対して呼ぶが、ここでは局面の再現性そのものではなくcomputeCoachの分岐ロジックを検証したいため、
// G.freshSolverProbe/G.ddParAnalyzeを一時的にスパイ(差し替え)して任意の戻り値を注入する。
// rebuildState(rec, 0)はrec.moves[0]自体をreplayしない(upto=0)ため、moves[0]の内容(手駒に実在するか等)
// の厳密な整合性は問われず、st は初期状態(actor=parent, phase="bury")のまま安全に使える。

function fixtureRec(actionKoma) {
  return {
    gameNo: 1, matchNo: 1, parent: "S",
    initialHands: {N: ["馬"], W: ["馬"], S: ["銀", "馬", "角", "飛", "王", "香", "し", "し"], E: ["馬"]},
    scoresBefore: {NS: 0, EW: 0},
    moves: [{seat: "S", human: true, action: {type: "attack", koma: actionKoma}}],
    result: null,
  };
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const G = T.G;

  const origProbe = G.freshSolverProbe;
  const origPar = G.ddParAnalyze;

  function withMocks(probeReturn, parReturn, fn) {
    G.freshSolverProbe = () => probeReturn;
    G.ddParAnalyze = () => parReturn;
    try { fn(); } finally { G.freshSolverProbe = origProbe; G.ddParAnalyze = origPar; }
  }

  // ---- (a) M-14: ddParAnalyze が ok:false(総駒>20)を返す場合、missにもagreeにも数えない ----
  {
    const rec = fixtureRec("銀");   // 人間の実際の手 = 攻め「銀」
    withMocks(
      {move: {type: "attack", koma: "金"}, why: "Solver — 30点の確実な上がり手順", dom: false},   // Solverの読みは「金」= 不一致(exact:false)
      {ok: false, msg: "局面が大きすぎます（総駒25・上限20）"},
      () => T.computeCoach(rec)
    );
    const mv = rec.moves[0];
    assert.ok(mv.cf, "cfが設定される");
    assert.strictEqual(mv.cf.agree, false, "agreeはfalse(agree扱いにしない)");
    assert.notStrictEqual(mv.cf.src, "solver", "cf.srcは非\"solver\"になる(M-14): " + mv.cf.src);
    assert.strictEqual(mv.cf.src, "solverUnverified", "cf.srcは\"solverUnverified\"になる(M-14): " + mv.cf.src);
    const cs = T.coachSummary(rec);
    assert.strictEqual(cs.miss, 0, "coachSummaryのmissに数えられない(⚠の正定義=src===\"solver\"厳密一致から自然に除外): " + JSON.stringify(cs));
    assert.strictEqual(cs.agree, 0, "coachSummaryのagreeにも数えられない(保留であり合格扱いでもない): " + JSON.stringify(cs));
    console.log("PASS (a): ddParAnalyzeがok:falseの手はmissにもagreeにも数えられない(M-14)");
  }

  // ---- (b) 回帰: ddParAnalyze が ok:true・同点行ありなら従来どおりalt救済でagree=true・src=\"solver\" ----
  {
    const rec = fixtureRec("銀");
    withMocks(
      {move: {type: "attack", koma: "金"}, why: "Solver — 30点の確実な上がり手順", dom: false},
      {ok: true, total: 12, seat: "S", phase: "attack",
       rows: [{type: "attack", koma: "金", v: 30}, {type: "attack", koma: "銀", v: 30}]},   // 同点(差0)
      () => T.computeCoach(rec)
    );
    const mv = rec.moves[0];
    assert.strictEqual(mv.cf.agree, true, "同点別手順はagree=true(回帰なし): " + JSON.stringify(mv.cf));
    assert.strictEqual(mv.cf.alt, true, "altフラグも立つ(回帰なし)");
    assert.strictEqual(mv.cf.src, "solver", "src=\"solver\"のまま(dom:falseのため。回帰なし)");
    console.log("PASS (b): ddParAnalyzeがok:true・同点なら従来どおりalt救済される(回帰なし)");
  }

  // ---- (c) 回帰: ddParAnalyze が ok:true・非同点なら従来どおりmissとしてsrc=\"solver\" ----
  {
    const rec = fixtureRec("銀");
    withMocks(
      {move: {type: "attack", koma: "金"}, why: "Solver — 30点の確実な上がり手順", dom: false},
      {ok: true, total: 12, seat: "S", phase: "attack",
       rows: [{type: "attack", koma: "金", v: 30}, {type: "attack", koma: "銀", v: 10}]},   // 大差
      () => T.computeCoach(rec)
    );
    const mv = rec.moves[0];
    assert.strictEqual(mv.cf.agree, false, "非同点はagree=falseのまま(回帰なし)");
    assert.strictEqual(mv.cf.src, "solver", "src=\"solver\"のまま(回帰なし)");
    const cs = T.coachSummary(rec);
    assert.strictEqual(cs.miss, 1, "従来どおりmissに数えられる(回帰なし): " + JSON.stringify(cs));
    console.log("PASS (c): ddParAnalyzeがok:true・非同点なら従来どおりmissになる(回帰なし)");
  }

  // ---- (d) 回帰: exact一致(probe.moveと人間の手が完全一致)ならddParAnalyzeは呼ばれずagree=true ----
  {
    const rec = fixtureRec("金");   // 人間の手 = probe.moveと同じ「金」
    let parCalled = false;
    G.freshSolverProbe = () => ({move: {type: "attack", koma: "金"}, why: "Solver — 20点", dom: false});
    G.ddParAnalyze = () => { parCalled = true; return {ok: false}; };
    try { T.computeCoach(rec); } finally { G.freshSolverProbe = origProbe; G.ddParAnalyze = origPar; }
    const mv = rec.moves[0];
    assert.strictEqual(parCalled, false, "exact一致時はddParAnalyzeが呼ばれない(回帰なし)");
    assert.strictEqual(mv.cf.agree, true, "exact一致はagree=true(回帰なし)");
    assert.strictEqual(mv.cf.src, "solver", "exact一致・dom:falseはsrc=\"solver\"のまま(回帰なし)");
    console.log("PASS (d): exact一致時はddParAnalyzeを呼ばずsrc=\"solver\"・agree=trueのまま(回帰なし)");
  }

  console.log("ALL v92 UNVERIFIED TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
