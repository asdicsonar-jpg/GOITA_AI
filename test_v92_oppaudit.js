const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-1(v92a, PLAN_v92_consistency.md): auditOppProfile の「騙し単騎率」(app.oppCounts.bl) に
// (a) 相方が先に同駒を攻めていた手(かかり応え文脈)・(b) 自席の同駒2打目、の除外を追加する。
// auditTblConformity と同型の kak 文脈追跡(ac<=4窓)を持ち、除外しないと、エンジン自身が推奨する
// 正しい応え(kakariGotae)まで「騙し単騎」に計上され、蓄積された bluff 率が相方AIのペア読みを狂わせる。
// あわせて、蓄積済み oppCounts.bl を1回だけリセットする移行処理(blV バージョンフィールド)を検証する。

function baseRec(parent, moves, initialHands) {
  return {
    gameNo: 1, matchNo: 1, parent,
    initialHands,
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: null,
  };
}

// 実エンジン(G.newGameState/G.advance)で手順を実際に進めて合法な移動列を作る(test_gotae.jsと同じ手法)。
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

  app.humanSeat = "S";

  // test_gotae.js (d) と同一のfixture: 相方(N)が金をリード(かかり)、南(唯一の金保持)が
  // 後の独立した攻め番で金を攻める(応え)。従来はこれが「騙し単騎」(bl.k++)に誤計上されていた。
  function kakariGotaeFixture(gameNo) {
    const initialHands = {
      W: ["馬", "角", "銀", "飛", "王", "し", "し", "し"],
      N: ["金", "銀", "馬", "香", "香", "し", "し", "王"],
      S: ["金", "角", "飛", "銀", "し", "し", "し", "王"],
      E: ["馬", "角", "銀", "飛", "王", "し", "し", "し"],
    };
    const actions = [
      {type: "bury", koma: "し"}, {type: "attack", koma: "金"},   // N: attack#1 = かかり(金リード)
      {type: "pass"}, {type: "pass"}, {type: "pass"},             // W,S,E pass(Sは金を温存)
      {type: "bury", koma: "し"}, {type: "attack", koma: "銀"},   // N: attack#2
      {type: "pass"},                                             // W pass
      {type: "receive", koma: "銀"},                              // S receive -> S becomes attacker
      {type: "attack", koma: "金"},                               // S: attack#3 = かかり応え(唯一の金)
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    const rec = baseRec("N", moves, initialHands);
    rec.gameNo = gameNo;
    return rec;
  }

  // ---- (a) 相方リード→単騎応え×3局で bl.k/bl.n が増えない ----
  {
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    for (let g = 1; g <= 3; g++) T.auditOppProfile(kakariGotaeFixture(g));
    assert.strictEqual(app.oppCounts.bl.n, 0, "かかり応え×3局でbl.nが増えない: " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 0, "かかり応え×3局でbl.kが増えない: " + JSON.stringify(app.oppCounts.bl));
    console.log("PASS (a): 相方リード→単騎応え×3局でbl.k/bl.nが増えない");
  }

  // ---- (b) 自席の同駒2打目の除外: Sが金を2枚持ち、1打目(ac=1,手駒2枚→非単騎)の後、
  //      全員パスで打ち直し、2打目(ac=2,手駒1枚→単騎に見える)を攻める。2打目は除外されるべき。 ----
  {
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    const initialHands = {
      N: ["馬"], W: ["馬"], E: ["馬"],
      S: ["金", "金", "し", "し", "し", "し", "し", "し"],
    };
    const actions = [
      {type: "bury", koma: "し"}, {type: "attack", koma: "金"},   // S: attack#1(手駒2枚→非単騎)
      {type: "pass"}, {type: "pass"}, {type: "pass"},             // N,W,E pass
      {type: "bury", koma: "し"}, {type: "attack", koma: "金"},   // S: attack#2(残り1枚。旧実装なら単騎誤計上)
    ];
    const moves = playSequence(G, initialHands, "S", actions);
    const rec = baseRec("S", moves, initialHands);
    T.auditOppProfile(rec);
    assert.strictEqual(app.oppCounts.bl.n, 1, "1打目のみ計上され2打目は除外される(n=1): " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 0, "1打目は非単騎(手駒2枚)なのでk=0のまま: " + JSON.stringify(app.oppCounts.bl));
    console.log("PASS (b): 自席の同駒2打目はbl.n/bl.kに計上されない(ペア保持者の2枚目)");
  }

  // ---- (c) 回帰: 自発の早期単騎攻め(相方の先行攻めなし・自席の先行攻めなし)は従来どおり計上される ----
  {
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    const rec = baseRec("S", [
      {seat: "S", action: {type: "bury", koma: "し"}},
      {seat: "S", action: {type: "attack", koma: "金"}},
    ], {N: ["馬"], W: ["馬"], S: ["金", "し", "し", "し", "し", "し", "し", "し"], E: ["馬"]});
    T.auditOppProfile(rec);
    assert.strictEqual(app.oppCounts.bl.n, 1, "自発の早期単騎攻めはbl.nに計上される(回帰なし): " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 1, "手駒1枚(単騎)なのでbl.kも計上される(回帰なし): " + JSON.stringify(app.oppCounts.bl));
    console.log("PASS (c): 自発の早期単騎攻めは従来どおりbl.n/bl.kに計上される(回帰)");
  }

  // ---- (d) 移行処理: oppCounts.blは1回だけリセットされ、blVがあれば再発火しない ----
  {
    // 旧(v91a以前・blVなし)の汚染データを模擬した永続化payloadをlocalStorageへ直接投入
    const legacy = {
      version: 1, savedAt: new Date().toISOString(),
      career: [], puzzleStats: {tried: 0, solved: 0}, convTrust: {n: 0, ok: 0}, tblTrust: {n: 0, hit: 0},
      oppCounts: {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 10, k: 7}},   // blVなし = 未移行の旧データ
      allGames: [],
    };
    dom.window.localStorage.setItem(T.CAREER_STORAGE_KEY, JSON.stringify(legacy));
    // 実装(index.html)は "loadCareerFromStorage(); oppCountsMigrateBl(app.oppCounts);" という対で
    // 起動時に1度だけ実行される(loadCareerFromStorage自体は不変条件のため移行処理はその外側にある)。
    // ここでは同じ対をテストから直接再現し、起動を模擬する。
    T.loadCareerFromStorage();
    T.oppCountsMigrateBl(app.oppCounts);
    assert.strictEqual(app.oppCounts.bl.n, 0, "1回目の読み込みでblがリセットされる(n): " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 0, "1回目の読み込みでblがリセットされる(k): " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.blV, 1, "移行済みマーカーblVが立つ");
    assert.strictEqual(app.oppCounts.pe.n, 0, "pe/ppは無関係なので保持される(この例では変化なし)");

    // 移行後に実際の対局で蓄積したデータを模擬してから永続化(blV込みで保存される)
    app.oppCounts.bl = {n: 3, k: 1};
    T.saveCareerToStorage();

    // 2回目以降の起動(読み込み)を模擬: 同じ対を再度呼んでも、blVがあるので再リセットされない
    T.loadCareerFromStorage();
    T.oppCountsMigrateBl(app.oppCounts);
    assert.strictEqual(app.oppCounts.bl.n, 3, "2回目の読み込みではblが再リセットされない(n): " + JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 1, "2回目の読み込みではblが再リセットされない(k): " + JSON.stringify(app.oppCounts.bl));
    console.log("PASS (d): oppCounts.blの移行は1回だけで、blVにより2回目以降(2回目のloadCareerFromStorage呼び出し)は再発火しない");
  }

  // ---- (e) FIX(REVIEW Must-fix1): 相方の香リードが攻め通し5〜7(旧ac<=4窓の外)に来ても、
  //      その後の人間の単騎香かかり応え(ac<=8)はbl.n/bl.kに計上されない ----
  //      窓なし化前は、この場合だけkak[相方]["香"]が立たず、応えが「騙し単騎」に誤計上されていた。
  {
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    const initialHands = {
      N: ["し", "し", "し", "し", "飛", "香", "王"],
      W: ["飛", "角", "王"],
      S: ["角", "し", "し", "香", "金"],
      E: ["し", "し", "金"],
    };
    const actions = [
      {type: "bury", koma: "し"}, {type: "attack", koma: "飛"},   // N(親): attack#1=飛 [ac=1]
      {type: "receive", koma: "飛"},                               // W受け -> Wが攻め手番に
      {type: "attack", koma: "角"},                                // W: attack#2=角 [ac=2]
      {type: "receive", koma: "角"},                               // S受け -> Sが攻め手番に
      {type: "attack", koma: "し"},                                // S: attack#3=し [ac=3]
      {type: "receive", koma: "し"},                               // E受け -> Eが攻め手番に
      {type: "attack", koma: "し"},                                // E: attack#4=し [ac=4]
      {type: "receive", koma: "し"},                               // N受け -> Nが攻め手番に(伏せなし)
      {type: "attack", koma: "香"},                                // N: attack#5=香 [ac=5] ← 旧ac<=4窓の外の香リード
      {type: "pass"}, {type: "pass"}, {type: "pass"},              // W,S,E全パス -> Nが攻め直し
      {type: "bury", koma: "し"}, {type: "attack", koma: "し"},    // N: attack#6=し [ac=6]
      {type: "pass"},                                               // W pass
      {type: "receive", koma: "し"},                                // S受け -> Sが攻め手番に(伏せなし)
      {type: "attack", koma: "香"},                                 // S: attack#7=香 [ac=7] ← 単騎香かかり応え
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    const rec = baseRec("N", moves, initialHands);
    T.auditOppProfile(rec);
    assert.strictEqual(app.oppCounts.bl.n, 0,
      "相方の香リードが攻め通し5(旧窓の外)でも応えはbl.nに計上されない(REVIEW Must-fix1): " +
      JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 0,
      "同上・bl.kも計上されない: " + JSON.stringify(app.oppCounts.bl));
    console.log("PASS (e): 相方の香リードが攻め通し5〜7でも、その後の単騎香かかり応えはbl.n/bl.kに計上されない(REVIEW Must-fix1)");
  }

  console.log("ALL v92 OPPAUDIT TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
