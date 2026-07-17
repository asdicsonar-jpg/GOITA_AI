const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-2/M-3(v92a, PLAN_v92_consistency.md): buildConceptProfile の miss 判定を
// `String(mv.cf.src).indexOf("solver")===0` から `mv.cf.src === "solver"` の厳密一致へ統一する(M-2)。
// あわせて sig と cf を独立集計する(M-3): mv.sig がある手でも cf の⚠が miss/lossSum に反映されるように。
// sig 統計(sigOK/sigFalse/sigWasted)は sig 項のみに反映する。
//
// buildConceptProfile は ensureAnalyzed(rec) 経由で computeSignals/computeCoach を(冪等に)呼ぶが、
// mv.sig/mv.cf をあらかじめ明示的に設定しておけば(undefinedでなければ)いずれも再計算をスキップする
// ため、ここでは実エンジンの合法手順を経由せず、直接 mv.sig/mv.cf を組み立てて判定だけを検証する。

function fixtureRec(moves) {
  return {gameNo: 1, matchNo: 1, parent: "S", initialHands: null, scoresBefore: {NS: 0, EW: 0}, moves, result: null};
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;

  // ---- (a) M-2: solverDom(確定でない賭け)は miss に数えない(⚠の正定義=厳密一致"solver"と統一) ----
  {
    const mv = {human: true, forced: false, action: {type: "receive", koma: "金"}, sig: null,
      cf: {agree: false, src: "solverDom", why: "支配局面 — 30点狙い", type: "receive", koma: "金"}};
    const stats = T.buildConceptProfile([fixtureRec([mv])]);
    const s = stats[T.conceptOf(mv)];
    assert.strictEqual(s.seen, 1, "seenは1件計上される");
    assert.strictEqual(s.miss, 0, "solverDomはmissに数えない(M-2): " + JSON.stringify(s));
    assert.strictEqual(s.ok, 0, "cf.agree=falseなのでokにも数えない");
    console.log("PASS (a): src=\"solverDom\"はbuildConceptProfileのmissに数えられない(M-2)");
  }

  // ---- (b) 回帰: src==="solver"厳密一致は従来どおりmissに数える ----
  {
    const mv = {human: true, forced: false, action: {type: "attack", koma: "銀"}, sig: null,
      cf: {agree: false, src: "solver", why: "Solver — 20点の確実な上がり手順", type: "attack", koma: "銀"}};
    const stats = T.buildConceptProfile([fixtureRec([mv])]);
    const s = stats[T.conceptOf(mv)];
    assert.strictEqual(s.miss, 1, "src===\"solver\"は従来どおりmissに数える(回帰なし): " + JSON.stringify(s));
    console.log("PASS (b): src=\"solver\"(厳密一致)は従来どおりmissに数えられる(回帰なし)");
  }

  // ---- (c) M-3: mv.sig(honest)があってもcfの⚠(src==="solver"かつagree:false)はmissに反映される ----
  {
    const mv = {human: true, forced: false, action: {type: "attack", koma: "馬"}, sig: {type: "kgb_pair", honest: true},
      cf: {agree: false, src: "solver", why: "Solver — 10点の確実な上がり手順", type: "attack", koma: "馬"}};
    const stats = T.buildConceptProfile([fixtureRec([mv])]);
    const s = stats[T.conceptOf(mv)];
    assert.strictEqual(s.miss, 1, "sigがあってもcfの⚠はmissへ反映される(M-3): " + JSON.stringify(s));
    assert.strictEqual(s.ok, 0, "sig.honestはokに反映されない(sig統計はsig項のみ・M-3): " + JSON.stringify(s));
    assert.strictEqual(s.sigOK, 1, "sig統計自体は従来どおりsigOKに反映される: " + JSON.stringify(s));
    console.log("PASS (c): sig(honest)付きの手でもcfの⚠はmiss/lossSumへ独立して反映される(M-3)");
  }

  // ---- (d) 回帰: sigFalseの手はsigFalse(+wasted)に反映され、cfが無ければok/missは変化しない ----
  {
    const mv = {human: true, forced: false, action: {type: "attack", koma: "香"},
      sig: {type: "kyo2", honest: false, wasted: true}, cf: null};
    const stats = T.buildConceptProfile([fixtureRec([mv])]);
    const s = stats[T.conceptOf(mv)];
    assert.strictEqual(s.sigFalse, 1, "sigFalseは従来どおり計上される(回帰なし): " + JSON.stringify(s));
    assert.strictEqual(s.sigWasted, 1, "sigWastedも従来どおり計上される(回帰なし): " + JSON.stringify(s));
    assert.strictEqual(s.ok, 0, "cfが無ければokは増えない");
    assert.strictEqual(s.miss, 0, "cfが無ければmissも増えない");
    console.log("PASS (d): sigFalse/sigWastedは従来どおり計上され、cfが無いときはok/missに影響しない(回帰なし)");
  }

  // ---- (e) 回帰: cf.agree===trueは従来どおりokに数える(sigの有無に関わらず)。
  //      sig(kgb_pair)有りの手は概念キーがsig_sendに変わる(conceptOfの仕様)ため、
  //      集計先バケットをmv毎に個別に見て確認する。 ----
  {
    const mv1 = {human: true, forced: false, action: {type: "attack", koma: "飛"}, sig: null,
      cf: {agree: true, src: "solver", why: "", type: "attack", koma: "飛"}};
    const mv2 = {human: true, forced: false, action: {type: "attack", koma: "飛"}, sig: {type: "kgb_pair", honest: true},
      cf: {agree: true, src: "solver", why: "", type: "attack", koma: "飛"}};
    const stats = T.buildConceptProfile([fixtureRec([mv1, mv2])]);
    const s1 = stats[T.conceptOf(mv1)], s2 = stats[T.conceptOf(mv2)];
    assert.strictEqual(s1.ok, 1, "sig無しの手はcf.agree===trueで従来どおりokに数える(回帰なし): " + JSON.stringify(s1));
    assert.strictEqual(s2.ok, 1, "sig有りの手もcf.agree===trueでokに数える(M-3で新規に成立・以前はsig.honestのみでokになっていた): " + JSON.stringify(s2));
    assert.strictEqual(s2.sigOK, 1, "sigOKはsigが付いた手の分だけ計上される: " + JSON.stringify(s2));
    console.log("PASS (e): cf.agree===trueは従来どおり(かつsig有りでも独立に)okに数える(回帰なし)");
  }

  console.log("ALL v92 CONCEPT TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
