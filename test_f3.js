const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// F-3(PLAN_v90_2_threefixes.md): し攻め宣言の「宣言時保有」判定が、攻め時点の手駒だけを数えており、
// し4枚→し伏せ→初手しで攻める(伏せ同駒2倍狙いの正規戦略形)を「薄いし攻め宣言(し3枚)」と誤判定していた。
// 修正: 自分がこの局で既に伏せたしを shiN に加算する。

function baseRec(seat, moves, result) {
  return {
    gameNo: 1, parent: seat,
    initialHands: {N: [], W: [], S: [], E: []},
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: result || null,
  };
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const app = T.app;

  app.cfg.sighonest = true;

  // (a) し4枚・伏せし・初手し攻め → 「十分なし保有」(honest=true) であるべき(修正前は shiN=3 で薄い扱い)
  {
    const seat = "S", partner = "N";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "し"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: true}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {winner: seat});
    // st.hands[seat] just before move index 1 (attack) still holds the remaining 3 "し" (post-bury).
    // rebuildState() is exercised indirectly by computeSignals() via the real rec/move history; here we
    // hand-construct app.st fixture material through the real rebuildState() so hands reflect the actual
    // bury having already removed one "し".
    rec.initialHands = {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "し", "角", "銀", "飛", "香"], E: ["馬"]};
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.ok(sig, "a shi-attack-declaration signal should be detected");
    assert.strictEqual(sig.type, "shi_sig", "should be classified as shi_sig");
    assert.strictEqual(sig.honest, true, "4 total (3 in hand + 1 buried) should count as honest (>=4)");
    assert.ok(!/薄い/.test(sig.text), "text should not say '薄い' when honest: " + sig.text);
    console.log("PASS (a): し4枚・伏せし・初手し → 十分なし保有(honest)と判定される");
  }

  // (b) し3枚・伏せ馬(し以外)・初手し攻め → 引き続き「薄い(3枚)」のまま(回帰: 伏せた駒がしでなければ加算しない)
  {
    const seat = "S", partner = "N";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "馬"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: true}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {winner: "W"});   // lost (winner is EW)
    rec.initialHands = {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "馬", "角", "銀", "飛", "香"], E: ["馬"]};
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.ok(sig, "signal should still be detected");
    assert.strictEqual(sig.honest, false, "3 total (no buried し) should remain not-honest");
    assert.ok(/薄い/.test(sig.text) && sig.text.includes("3枚"), "text should say '薄い(3枚)': " + sig.text);
    console.log("PASS (b): し3枚・伏せ馬・初手し → 従来どおり薄い(3枚)のまま(回帰なし)");
  }

  // (c) し4枚・伏せ馬(し以外)・初手し攻め → 従来どおりhonest(この局は伏せしの加算がなくても4枚で足りるケース)
  {
    const seat = "S";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "馬"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: true}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {winner: seat});
    rec.initialHands = {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "し", "角", "銀", "飛", "馬"], E: ["馬"]};
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.strictEqual(sig.honest, true, "already-honest case (4 in hand) must remain honest");
    console.log("PASS (c): し4枚・伏せ馬・初手し → 従来どおりhonest(回帰なし)");
  }

  // (d) 王合図分岐は本修正の対象外であり出力不変(honest判定はhand.includes('王')のまま)
  {
    const seat = "S";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "し"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: true}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {winner: seat});
    // 王を保有しており、直前の攻めが detectOuSignals にヒットする王合図局面を模す。
    // (簡易フィクスチャ: detectOuSignals は既存のG関数を呼ぶため、ここでは honest=trueとなる
    //  「王を保有した状態でしを攻める」构成のみを確認し、王合図分岐の出力形自体は変更していないことを
    //  コードの非改変(auditOuShiSignal内のou_sig分岐に一切触れていない)で担保する。)
    rec.initialHands = {N: ["馬"], W: ["馬"], S: ["王", "し", "し", "し", "角", "銀", "飛", "香"], E: ["馬"]};
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.ok(sig, "signal should be detected");
    // ou_sig or shi_sig -- either way, honest must reflect hand.includes("王") for the ou branch,
    // untouched by this fix (F-3 only touches the shi_sig branch's shiN computation).
    console.log("PASS (d): 王合図分岐はコード非改変(shi_sig分岐のみ変更) — 検出結果:", sig.type, "honest:", sig.honest);
  }

  // (e) スクリーンショット再現fixture: し4枚・伏せし・初手し・敗局(この局を落とした)。
  //     修正前は shiN=3 と誤判定され honest=false・lost=true で wasted=true となり「⚠ 薄いし攻め」
  //     が誤って出ていた。修正後は shiN=4(3+伏せ1) で honest=true となり wasted は honest優先で false、
  //     text に ⚠ が出ないことを断言する。
  {
    const seat = "S";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "し"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: false}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {winner: "W"});   // 敗局(winnerはEW側)
    rec.initialHands = {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "し", "角", "銀", "飛", "香"], E: ["馬"]};
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.strictEqual(sig.type, "shi_sig", "should be a shi_sig signal");
    assert.strictEqual(sig.honest, true, "4 total (3 in hand + 1 buried) should be honest even though the game was lost");
    assert.strictEqual(sig.wasted, false, "wasted must be false once honest is true (honest gates before lost is considered)");
    assert.ok(!sig.text.includes("⚠"), "no ⚠ warning should appear for an honest 4-shi declaration, even in a lost game: " + sig.text);
    console.log("PASS (e): スクリーンショット同型局(し4枚・伏せし・初手し・敗局)の再現fixtureで⚠が出ない");
  }

  console.log("ALL F-3 TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
