// verify_scorer.js — A/Bハーネスの採点経路(refG.advance()のev.gameOver)を、test_real24.js
// (アプリ内の権威実装=onGameOverへres={winner,pts,dbl,draw}を渡す実局47手)で再生検証する。
// ハーネスは採点ロジックを自作せず、権威実装そのもの(G.advance)を直接呼ぶ設計であるため、
// この検証は「ハーネスの状態機械駆動(newGameState/advance呼び出し)が正しく配線されているか」の
// 検証に相当する。期待結果: 第47手で終局・北(N)の馬上がり20点。
"use strict";
const assert = require("assert");
const path = require("path");
const { loadEnginesFromFile } = require("./load_engine.js");

const SRC = path.join(__dirname, "..", "..", "src", "index.html");
const { G } = loadEnginesFromFile(SRC);

// tests/test_real24.js と同一の実局データ(第4局・親:西・47手・北の馬上がり20点)
const initialHands = {
  N: ["し", "し", "王", "王", "金", "香", "香", "馬"],
  W: ["し", "し", "し", "角", "角", "金", "銀", "馬"],
  S: ["し", "し", "銀", "銀", "銀", "飛", "香", "馬"],
  E: ["し", "し", "し", "金", "金", "飛", "香", "馬"],
};
const seq = [
  ["W", "bury", "し"], ["W", "attack", "角"], ["S", "pass", null], ["E", "pass", null], ["N", "pass", null],
  ["W", "bury", "し"], ["W", "attack", "角"], ["S", "pass", null], ["E", "pass", null], ["N", "receive", "王"],
  ["N", "attack", "香"], ["W", "pass", null], ["S", "pass", null], ["E", "receive", "香"],
  ["E", "attack", "金"], ["N", "pass", null], ["W", "pass", null], ["S", "pass", null],
  ["E", "bury", "し"], ["E", "attack", "飛"], ["N", "pass", null], ["W", "pass", null], ["S", "receive", "飛"],
  ["S", "attack", "香"], ["E", "pass", null], ["N", "pass", null], ["W", "pass", null],
  ["S", "bury", "銀"], ["S", "attack", "銀"], ["E", "pass", null], ["N", "pass", null], ["W", "receive", "銀"],
  ["W", "attack", "金"], ["S", "pass", null], ["E", "pass", null], ["N", "receive", "金"],
  ["N", "attack", "王"], ["W", "pass", null], ["S", "pass", null], ["E", "pass", null],
  ["N", "bury", "し"], ["N", "attack", "香"], ["W", "pass", null], ["S", "pass", null], ["E", "pass", null],
  ["N", "bury", "し"], ["N", "attack", "馬"],
];

const st = G.newGameState(JSON.parse(JSON.stringify(initialHands)), "W");
let result = null, nMoves = 0;
for (const [seat, type, koma] of seq) {
  assert.strictEqual(st.actor, seat, "手番一致(#" + (nMoves + 1) + "): 棋譜=" + seat + " エンジン=" + st.actor);
  const ev = G.advance(st, koma ? { type, koma } : { type });
  nMoves++;
  if (ev && ev.gameOver) result = ev.gameOver;
}
assert.strictEqual(nMoves, 47, "47手を完全再生");
assert.ok(result, "第47手で終局する");
assert.strictEqual(result.winner, "N", "実局どおり北の上がり: " + JSON.stringify(result));
assert.strictEqual(result.pts, 20, "実局どおり20点: " + JSON.stringify(result));
assert.strictEqual(result.dbl, false, "同駒2倍ではない: " + JSON.stringify(result));
console.log("PASS: ハーネスの採点経路(G.advance().ev.gameOver、単体抽出モジュール経由)が実局47手を" +
  "正しく再生し、北の馬上がり20点を再現した: " + JSON.stringify(result));
console.log("SCORER VERIFICATION PASSED");
