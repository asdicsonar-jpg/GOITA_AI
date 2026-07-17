const { buildDom, wait } = require("./harness.js");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

// v92b(M-10・PLAN_v92_consistency.md): computeCoach()の「AIなら」評価オプションを、実対局の
// 最強AI(tierOpts strong/coop)・liveの推奨手(adviceOpts系のMC評価)と同一条件に揃える。
//
// 修正前(v92a): computeCoach()の受け/攻めフォールバック分岐は{mc:false, mcDets:16, ddDets:12, ...}
// を使い、エンジンの受けMCゲート(o.mc必須)によりルール受け(receiveChoice)へ落ちていた。一方、実際の
// 最強AI(tierOpts strong/coop)やlive推奨(adviceOpts)はmc:trueでMC評価(mcDecideReceive/attackMC)を
// 使う。このため「画面の推奨手や実対局AIと同じ手を人間が打った」局面が振り返りでagree=falseになる
// 系統的な不一致があった。
//
// 本テストは、その不一致が実際に発生する局面をG.mulberry32/G.dealOnceによる決定的な配牌+
// 実対局相当のAI(tierOpts strong同等オプション)による自己対戦シミュレーションの中から
// プログラム的に探索して発見したfixture(seed/席/手数)を用いる。探索方法:
//   1. 配牌seedを1から順に試し、全席をtierOpts strong相当のAI(G.policyAction)で対局させる。
//   2. 対象席が「受け局面(相手の攻め・手駒6枚以下)」または「攻め局面(手駒2〜4枚)」に来るたび、
//      freshSolverProbeが null(Solverで確定しない局面)であることを条件に、
//      (a) 実対局AI相当のオプション(mcDets:96等・tierOpts strongと同一)によるG.policyActionの推奨と、
//      (b) 旧computeCoachのフォールバックオプション(mc:false・mcDets:16等)によるG.policyActionの推奨
//      が異なる(型または駒が食い違う)局面を記録する。
//   3. 受け局面2件・攻め局面1件が見つかった時点で採用(見つかったseed/席/手数を本テストに固定
//      埋め込みし、毎回の実行を高速・決定的にする。探索そのものの再現方法は上記コメントの通り)。
//
// 各fixtureについて、v92a版(修正前)ビルドのcomputeCoach()ではagree=falseになること(fail-before)、
// v92b版(修正後)ビルドのcomputeCoach()ではagree=trueになること(pass-after)を確認する。

function buildBeforeHtml() {
  const v92aPath = path.join(__dirname, "..", "..", "v92a", "src", "index.html");
  const v92aSrc = fs.readFileSync(v92aPath, "utf-8");
  const shim = fs.readFileSync(path.join(__dirname, "shim_block.txt"), "utf-8");
  const idx = v92aSrc.lastIndexOf("})();");
  if (idx < 0) throw new Error("})(); marker not found in v92a src");
  const out = v92aSrc.slice(0, idx) + shim + v92aSrc.slice(idx);
  const outPath = path.join(os.tmpdir(), "v92b_test_coach_mc_before_index.html");
  fs.writeFileSync(outPath, out, "utf-8");
  return outPath;
}

// tierOpts(strong/coop)と同一の「実対局の最強AI」オプション(v92b修正後のcomputeCoachと同一条件)。
function strongOpts(seed) {
  return {mc: true, solver: true, mcDets: 96, mcSeed: seed, attackMC: true, matchEq: true,
          dd: true, ddLimit: 16, ddDets: 16, wSample: true, danger: true};
}
// 修正前(v92a)のcomputeCoachフォールバックが実際に使っていたオプション(値をそのまま再現)。
function oldFallbackOpts(i) {
  return {mc: false, solver: true, mcDets: 16, attackMC: true, matchEq: true,
          dd: true, ddLimit: 16, ddDets: 12, wSample: true, danger: true, recvRisk: true, mcSeed: 1000 + i};
}

const FIXED_AI_SEED = 4242;   // 「実対局AI(tierOpts strong)」推奨手を決定的に再現するための固定mcSeed

// 探索で発見した3fixture(受け×2・攻め×1)。seed/席/手数(i)を固定してテストを高速・決定的にする
// (探索方法は上記コメント参照。本体は毎回このseedからの決定的リプレイのみ行う)。
const FIXTURES = [
  {label: "受け#1(seed=1,W)", seed: 1, humanSeat: "W", i: 19, kind: "receive"},
  {label: "受け#2(seed=14,S)", seed: 14, humanSeat: "S", i: 21, kind: "receive"},
  {label: "攻め#1(seed=436,S)", seed: 436, humanSeat: "S", i: 27, kind: "attack"},
];

// seed/humanSeat/iから、対象決定点までの局面と直前手順(priorMoves)を決定的に再構築する。
function replayToDecisionPoint(G, seed, i) {
  const hands = G.dealOnce(G.mulberry32(seed));
  const parent = G.SEATS[seed % 4];
  const st = G.newGameState(hands, parent);
  const priorMoves = [];
  while (st.history.length < i) {
    const seat = st.actor;
    const a = G.policyAction(st, seat, strongOpts(seed + 1));
    const act = {type: a.type, koma: a.koma || null};
    G.advance(st, act);
    priorMoves.push({seat, human: false, action: act});
  }
  return {st, hands, parent, priorMoves};
}

function buildRecForFixture(G, fx) {
  const {st, hands, parent, priorMoves} = replayToDecisionPoint(G, fx.seed, fx.i);
  assert.strictEqual(st.actor, fx.humanSeat, `${fx.label}: 決定点の手番が想定席と一致する`);
  assert.strictEqual(st.phase, fx.kind === "receive" ? "respond" : "attack",
    `${fx.label}: 決定点のフェーズが想定どおり(${fx.kind})`);
  const probe = G.freshSolverProbe(st, fx.humanSeat);
  assert.ok(!probe, `${fx.label}: 決定点はfreshSolverProbeがnull(Solver確定局面ではない・フォールバック分岐対象)`);

  const rAi = G.policyAction(st, fx.humanSeat, strongOpts(FIXED_AI_SEED));
  const rRule = G.policyAction(st, fx.humanSeat, oldFallbackOpts(fx.i));
  assert.strictEqual(rAi.type, fx.kind === "receive" ? "receive" : "attack",
    `${fx.label}: 実対局AI(tierOpts strong相当)の推奨手の型が想定どおり`);
  const diverges = rAi.type !== rRule.type || (rAi.koma || null) !== (rRule.koma || null);
  assert.ok(diverges,
    `${fx.label}: 実対局AI推奨(${JSON.stringify({type: rAi.type, koma: rAi.koma})})と` +
    `旧フォールバック推奨(${JSON.stringify({type: rRule.type, koma: rRule.koma})})が食い違う(fixture前提条件)`);

  const targetAction = {type: rAi.type, koma: rAi.koma || null};
  const moves = priorMoves.concat([{seat: fx.humanSeat, human: true, action: targetAction}]);
  const rec = {
    gameNo: FIXED_AI_SEED - 1,   // v92b: mcSeed = rec.gameNo+1 = FIXED_AI_SEED と一致させ、rAiと同一のMC結果を再現する
    matchNo: 1, parent,
    initialHands: hands, scoresBefore: {NS: 0, EW: 0},
    moves, result: null,
  };
  return {rec, targetAction, rAi, rRule};
}

(async () => {
  const beforePath = buildBeforeHtml();
  const domAfter = buildDom();               // tests/index.html = v92b(修正後・最新src/index.html)
  const domBefore = buildDom(beforePath);     // v92a(修正前)
  await wait(300);
  const Tbefore = domBefore.window.__T;
  const Tafter = domAfter.window.__T;
  const G = domAfter.window.__T.G;            // G/G_Bはv92a/v92bでbyte-exact同一

  Tbefore.app.cfg.mc = true; Tbefore.app.cfg.solver = true;
  Tafter.app.cfg.mc = true; Tafter.app.cfg.solver = true;

  for (const fx of FIXTURES) {
    const {rec, targetAction} = buildRecForFixture(G, fx);
    const lastIdx = rec.moves.length - 1;

    // --- 修正前(v92a): agree=false になることを確認(fail-before) ---
    const recBefore = JSON.parse(JSON.stringify(rec));
    Tbefore.computeCoach(recBefore);
    const cfBefore = recBefore.moves[lastIdx].cf;
    assert.ok(cfBefore, `${fx.label}: 修正前ビルドでもcfが算出される`);
    assert.strictEqual(cfBefore.agree, false,
      `${fx.label}: 修正前(v92a)は「実対局AI/live推奨と同じ手を人間が打った」のにagree=falseになる` +
      `(再現確認・fail-before): ${JSON.stringify(cfBefore)}`);
    console.log(`PASS (fail-before) ${fx.label}: v92aでagree=false再現 — 人間の手=${JSON.stringify(targetAction)}, cf=${JSON.stringify(cfBefore)}`);

    // --- 修正後(v92b): agree=true になることを確認(pass-after) ---
    const recAfter = JSON.parse(JSON.stringify(rec));
    Tafter.computeCoach(recAfter);
    const cfAfter = recAfter.moves[lastIdx].cf;
    assert.ok(cfAfter, `${fx.label}: 修正後ビルドでcfが算出される`);
    assert.strictEqual(cfAfter.agree, true,
      `${fx.label}: 修正後(v92b)は実対局AI/live推奨と同じ手を打った場合agree=trueになる(修正確認): ${JSON.stringify(cfAfter)}`);
    assert.strictEqual(recAfter.cfv, 2, `${fx.label}: 修正後ビルドでrec.cfv=2が設定される`);
    console.log(`PASS (pass-after)  ${fx.label}: v92bでagree=true確認 — cf=${JSON.stringify(cfAfter)}, rec.cfv=${recAfter.cfv}`);
  }

  console.log("\nALL v92b COACH_MC TESTS PASSED (受け局面2ケース・攻め局面1ケース、fail-before→pass-after確認)");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
