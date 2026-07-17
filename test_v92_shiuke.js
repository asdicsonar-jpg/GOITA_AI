const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-6(v92a, PLAN_v92_consistency.md): auditOuShiSignal の shiN(し攻め宣言の「宣言時保有」)に
// 「自席が受けで消費したし」を加算する。F-3(v90.2)は伏せたしを「使用済みの保有」として加算した
// (buriedShi)が、同じ理屈は初攻め前に受けで消費したしにも当てはまる(受けたしも消えたのではなく
// 使用済みの保有)。エンジンの読み側(inferPartnerHoldingsの「元保有4」読み＋消費控除)と揃え、
// し4枚→し受け→初攻めし、の形を薄い宣言(⚠)に誤判定しないようにする。
//
// 注: ごいたのルール上、受けた側は「そのまま攻め」(伏せなしで直ちに攻め手番)になるため、
// 「受け」の直後に同一プレイヤーが「伏せ」を挟むことはできない。したがって
// buriedShi(F-3)とreceivedShi(M-6)が同一の初攻めshiNへ同時に効くフィクスチャは実ゲームの
// 進行として構成できない(それぞれ独立した経路として検証する)。

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

function baseRec(parent, moves, initialHands, result) {
  return {
    gameNo: 1, matchNo: 1, parent,
    initialHands,
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: result || null,
  };
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const G = T.G;
  const app = T.app;

  app.cfg.sighonest = true;

  // SEATS=["N","W","S","E"](反時計回り)なので、Nが攻めた場合のrespQueueは["W","S","E"]の順。
  // Wは該当駒を持たずpass、Sが2番目の応答者として受ける、という順で確実にSに受けさせられる。

  // ---- (a) し4枚→し受け→初攻めし、が honest 判定になる(修正前はshiN=3で薄い扱い) ----
  //      Sの初期手駒はし4枚。うち1枚をNのし攻めへの受けで消費し(残り3枚)、Sがそのまま攻め手番になって
  //      初攻めのし攻めを行う。修正前は「手駒3枚」だけでshiN=3(薄い)と誤判定されていた。
  {
    const initialHands = {
      N: ["し", "馬", "角", "飛", "王", "銀", "香", "金"],
      W: ["角"],
      S: ["し", "し", "し", "し", "角", "銀", "飛", "香"],
      E: ["角"],
    };
    const actions = [
      {type: "bury", koma: "馬"}, {type: "attack", koma: "し"},   // N: attack#1(初攻めし。相方N自身の話ではなくSの受けを作るための布石)
      {type: "pass"},                                              // W pass(しを持たない)
      {type: "receive", koma: "し"},                               // S receive(し消費) -> Sがそのまま攻め手番
      {type: "attack", koma: "し"},                                // S: 初攻め(firstAtk) = し
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    moves[moves.length - 1].human = true;   // 監査対象はSの初攻めし
    const rec = baseRec("N", moves, initialHands, {winner: "S"});
    T.computeSignals(rec);
    const mv = moves[moves.length - 1];
    assert.strictEqual(mv.seat, "S", "最後の手はSのし初攻め");
    const sig = mv.sig;
    assert.ok(sig, "し攻めのsigが検出される");
    assert.strictEqual(sig.type, "shi_sig", "shi_sig分岐として判定される");
    assert.strictEqual(sig.honest, true, "4枚(手駒3+受け1)はhonestになる(M-6): " + JSON.stringify(sig));
    assert.ok(!/薄い/.test(sig.text), "薄いという文言が出ない: " + sig.text);
    console.log("PASS (a): し4枚→し受け→初攻めし、が honest 判定になる(M-6)");
  }

  // ---- (b) 回帰: 受けた駒がし以外(馬)なら加算されない(薄いまま3枚) ----
  {
    const initialHands = {
      N: ["馬", "角", "飛", "王", "銀", "香", "金", "し"],
      W: ["角"],
      S: ["馬", "し", "し", "し", "角", "銀", "飛", "香"],
      E: ["角"],
    };
    const actions = [
      {type: "bury", koma: "し"}, {type: "attack", koma: "馬"},   // N: attack#1 = 馬
      {type: "pass"},                                              // W pass(馬を持たない)
      {type: "receive", koma: "馬"},                               // S receive(馬。しは減らない)
      {type: "attack", koma: "し"},                                // S: 初攻め = し(手駒3枚のまま)
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    moves[moves.length - 1].human = true;   // 監査対象はSの初攻めし
    const rec = baseRec("N", moves, initialHands, {winner: "W"});   // 敗局
    T.computeSignals(rec);
    const mv = moves[moves.length - 1];
    assert.strictEqual(mv.seat, "S");
    const sig = mv.sig;
    assert.strictEqual(sig.honest, false, "受けた駒がし以外なら3枚のまま薄い(回帰なし): " + JSON.stringify(sig));
    assert.ok(/薄い/.test(sig.text) && sig.text.includes("3枚"), "「薄い(3枚)」の文言のまま: " + sig.text);
    console.log("PASS (b): 受けた駒がし以外(馬)なら加算されない(回帰なし)");
  }

  // ---- (c) 回帰: F-3(伏せしの加算)経路は本修正で変化しない。Sが親でし伏せ→初攻めし ----
  {
    const seat = "S";
    const moves = [
      {seat, human: true, action: {type: "bury", koma: "し"}},
      {seat, human: true, action: {type: "attack", koma: "し"}, cf: {agree: true}, sig: undefined},
    ];
    const rec = baseRec(seat, moves, {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "し", "角", "銀", "飛", "香"], E: ["馬"]}, {winner: seat});
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.strictEqual(sig.honest, true, "F-3(伏せし1+手駒3=4枚)は従来どおりhonest(回帰なし): " + JSON.stringify(sig));
    console.log("PASS (c): F-3の伏せし経路(親がし伏せ→初攻めし)は本修正の影響を受けず従来どおり動作する(回帰なし)");
  }

  console.log("ALL v92 SHIUKE TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
