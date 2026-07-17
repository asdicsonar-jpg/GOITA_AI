const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-8(v92a, PLAN_v92_consistency.md): signalTruth の伏せ駒カウントを符丁種で分岐する。
// kgb_pair(金銀馬)と香では bury(伏せ)を「場に出した同駒」に数えない(伏せは相方AIには見えず、
// 2枚目で取り返す約束の裏付けにならない)。し宣言では従来どおり数える(F-3: 伏せ同駒2倍が戦略の本体)。
// 従来はst.board[seat]のatk/defを無差別にplayed++しており、defにはbury行も含まれていたため、
// 金を伏せて単騎金をリードしただけで「ペアを正しく伝えています」と誤判定していた。

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;

  // ---- (a) kgb_pair: 金を1枚伏せ、残り1枚で単騎リード → 伏せは数えず、cnt=1のまま(honest=false) ----
  {
    const st = {
      hands: {S: ["金", "角", "銀"]},   // 手駒に金1枚(このsig対象の攻めで場に出る直前の状態)
      board: {S: [{def: {koma: "金", type: "bury"}, atk: null}]},   // 金を1枚伏せ済み
    };
    const sig = {signal_type: "kgb_pair", koma: "金"};
    const truth = T.signalTruth(st, "S", sig);
    assert.strictEqual(truth, false, "伏せた金は裏付けに数えない(手駒1+伏せ0=1<2): kgb_pairはbury除外(M-8)");
    console.log("PASS (a): kgb_pairは伏せ駒を裏付けに数えない(伏せ+単騎リードが誤ってペア証明にならない)");
  }

  // ---- (b) 回帰: kgb_pairで実際に場に出した(受けた)同駒があれば従来どおり裏付けになる ----
  {
    const st = {
      hands: {S: ["金", "角", "銀"]},
      board: {S: [{def: {koma: "金", type: "receive"}, atk: null}]},   // 金を1枚「受けた」(場に出ている=相方にも見える)
    };
    const sig = {signal_type: "kgb_pair", koma: "金"};
    const truth = T.signalTruth(st, "S", sig);
    assert.strictEqual(truth, true, "受けた(見える)同駒は従来どおり裏付けになる(手駒1+受け1=2): " + truth);
    console.log("PASS (b): kgb_pairでも受け(場に見える)は従来どおり裏付けとして数える(回帰なし)");
  }

  // ---- (c) 回帰: kgb_pairで攻め済み(atk)の同駒があれば従来どおり裏付けになる ----
  {
    const st = {
      hands: {S: ["金", "角", "銀"]},
      board: {S: [{atk: "金", def: null}]},   // 金を1枚「攻めで出した」(場に見える)
    };
    const sig = {signal_type: "kgb_pair", koma: "金"};
    const truth = T.signalTruth(st, "S", sig);
    assert.strictEqual(truth, true, "攻めで場に出した同駒は従来どおり裏付けになる: " + truth);
    console.log("PASS (c): kgb_pairでも攻め済み(atk)は従来どおり裏付けとして数える(回帰なし)");
  }

  // ---- (d) kyo2(香)も同様にbury除外 ----
  {
    const st = {
      hands: {S: ["香", "角", "銀"]},
      board: {S: [{def: {koma: "香", type: "bury"}, atk: null}]},
    };
    const sig = {signal_type: "kyo2", koma: "香"};
    const truth = T.signalTruth(st, "S", sig);
    assert.strictEqual(truth, false, "香も伏せは裏付けに数えない(M-8): " + truth);
    console.log("PASS (d): kyo2(香)も伏せ駒を裏付けに数えない(M-8)");
  }

  // ---- (e) 回帰: 手駒だけで既に2枚以上(伏せなし)なら従来どおりhonest ----
  {
    const st = {hands: {S: ["金", "金", "角"]}, board: {S: []}};
    const sig = {signal_type: "kgb_pair", koma: "金"};
    const truth = T.signalTruth(st, "S", sig);
    assert.strictEqual(truth, true, "手駒2枚のみ(伏せ/場出しなし)は従来どおりhonest(回帰なし): " + truth);
    console.log("PASS (e): 手駒だけで2枚以上あれば従来どおりhonest(回帰なし)");
  }

  console.log("ALL v92 SIGTRUTH TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
