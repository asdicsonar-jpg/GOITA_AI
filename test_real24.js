const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// レビュー用: Sonar報告の実局(第4局・親:西・47手・北の馬上がり20点)を棋譜どおり完全再現し、
// #24(南・攻め香)の符丁監査結果を検証する。Executorの独自fixture(機構的等価)に対する
// 実局での裏取り(REVIEW_REPORT_v90.3)。
const initialHands = {
  N: ["し","し","王","王","金","香","香","馬"],
  W: ["し","し","し","角","角","金","銀","馬"],
  S: ["し","し","銀","銀","銀","飛","香","馬"],
  E: ["し","し","し","金","金","飛","香","馬"],
};
const seq = [
  ["W","bury","し"],["W","attack","角"],["S","pass",null],["E","pass",null],["N","pass",null],
  ["W","bury","し"],["W","attack","角"],["S","pass",null],["E","pass",null],["N","receive","王"],
  ["N","attack","香"],["W","pass",null],["S","pass",null],["E","receive","香"],
  ["E","attack","金"],["N","pass",null],["W","pass",null],["S","pass",null],
  ["E","bury","し"],["E","attack","飛"],["N","pass",null],["W","pass",null],["S","receive","飛"],
  ["S","attack","香"],["E","pass",null],["N","pass",null],["W","pass",null],
  ["S","bury","銀"],["S","attack","銀"],["E","pass",null],["N","pass",null],["W","receive","銀"],
  ["W","attack","金"],["S","pass",null],["E","pass",null],["N","receive","金"],
  ["N","attack","王"],["W","pass",null],["S","pass",null],["E","pass",null],
  ["N","bury","し"],["N","attack","香"],["W","pass",null],["S","pass",null],["E","pass",null],
  ["N","bury","し"],["N","attack","馬"],
];

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T, G = T.G, app = T.app;
  app.cfg.sighonest = true;

  const st = G.newGameState(JSON.parse(JSON.stringify(initialHands)), "W");
  const moves = [];
  let result = null;
  for (const [seat, type, koma] of seq) {
    assert.strictEqual(st.actor, seat,
      "手番一致(#" + (moves.length + 1) + "): 棋譜=" + seat + " エンジン=" + st.actor);
    const ev = G.advance(st, koma ? {type, koma} : {type});
    moves.push({seat, human: seat === "S", action: {type, koma: koma || null}});
    if (ev && ev.gameOver) result = ev.gameOver;
  }
  assert.strictEqual(moves.length, 47, "47手を完全再生");
  assert.ok(result, "第47手で終局する");
  assert.strictEqual(result.winner, "N", "実局どおり北の上がり: " + JSON.stringify(result));
  assert.strictEqual(result.pts, 20, "実局どおり20点: " + JSON.stringify(result));
  console.log("PASS (再現性): 実棋譜47手が全手エンジン合法・手番一致で再生でき、北の20点上がりで終局");

  const rec = {gameNo: 4, matchNo: 1, parent: "W", initialHands,
               scoresBefore: {NS: 0, EW: 0}, moves, result};
  T.computeSignals(rec);

  const sig24 = rec.moves[23].sig;
  assert.ok(sig24, "#24(南・攻め香)にsigが設定される");
  console.log("#24 audit =", JSON.stringify(sig24));
  assert.strictEqual(sig24.type, "kakari_gotae", "#24はkyo2ではなくkakari_gotae");
  assert.strictEqual(sig24.honest, true, "#24はhonest固定");
  assert.strictEqual(sig24.koma, "香", "#24の応え駒は香");
  assert.ok(!/薄い|裏付けがありません|ズレます/.test(sig24.text), "警告文言を含まない: " + sig24.text);
  console.log("PASS (#24): 実局の#24がkakari_gotae(肯定表示)と判定される");

  const sig29 = rec.moves[28].sig;
  assert.ok(sig29 == null, "#29(南・攻め銀=攻め通し番号7・窓外)は監査対象外のまま: " + JSON.stringify(sig29));
  console.log("PASS (#29): 南の銀攻め(伏せ直し後)に偽陽性が出ない");

  console.log("ALL REAL-GAME TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
