const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// v90.3(PLAN_v90_3_gotae_audit.md): かかり応えの符丁監査誤判定を修正。
// 相方が既に同駒を攻めていた場合、自分の同駒攻めは「応え」であり新たな符丁宣言ではない。
// 変更1: detectSignal()に応え文脈ガードを追加。変更2: computeSignals()にG.kakariGotae()による
// かかり応えの肯定的認識(kakari_gotae)を追加。

function baseRec(parent, moves, initialHands) {
  return {
    gameNo: 1, matchNo: 1, parent,
    initialHands,
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: null,
  };
}

// 実エンジン(G.newGameState/G.advance)で手順を実際に進めて合法な移動列を作る(rebuildStateの
// 手番不一致/手駒不所持チェックに通る、機械的に妥当な棋譜を保証するため)。
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

  app.cfg.sighonest = true;

  // ---- (a) 報告局の再現fixture: 相方(北)の香リード(かかり)に、南(唯一の香保持)が後の独立した
  //      攻め番で香を攻める(応え)。従来はこれがkyo2(香ペア偽宣言・赤警告)に誤判定されていた。 ----
  {
    const initialHands = {
      W: ["馬", "角", "銀", "飛", "王", "し", "し", "し"],
      N: ["香", "香", "金", "金", "銀", "し", "し", "王"],
      S: ["香", "角", "飛", "金", "銀", "し", "し", "王"],
      E: ["馬", "角", "金", "飛", "王", "し", "し", "し"],
    };
    const actions = [
      {type: "bury", koma: "し"}, {type: "attack", koma: "馬"},           // W: attack#1
      {type: "pass"}, {type: "pass"}, {type: "pass"},                     // S,E,N pass
      {type: "bury", koma: "し"}, {type: "attack", koma: "角"},           // W: attack#2
      {type: "pass"}, {type: "receive", koma: "角"},                      // S pass, E receive
      {type: "attack", koma: "金"},                                       // E: attack#3
      {type: "receive", koma: "金"},                                      // N receive
      {type: "attack", koma: "香"},                                       // N: attack#4 = かかり(香リード)
      {type: "pass"}, {type: "pass"}, {type: "pass"},                     // W,S,E pass(Sは香を温存)
      {type: "bury", koma: "し"}, {type: "attack", koma: "金"},           // N: attack#5
      {type: "pass"},                                                     // W pass
      {type: "receive", koma: "金"},                                      // S receive -> S becomes attacker
      {type: "attack", koma: "香"},                                       // S: attack#6 = かかり応え(唯一の香)
    ];
    const moves = playSequence(G, initialHands, "W", actions);
    moves[moves.length - 1].human = true;   // 監査対象は南(人間)の最後の香攻め
    const rec = baseRec("W", moves, initialHands);
    T.computeSignals(rec);
    const sig = rec.moves[rec.moves.length - 1].sig;
    assert.ok(sig, "報告局#24相当の攻めにsigが設定される");
    assert.strictEqual(sig.type, "kakari_gotae", "kyo2ではなくkakari_gotaeと判定される: " + JSON.stringify(sig));
    assert.strictEqual(sig.honest, true, "かかり応えはhonest固定");
    assert.ok(sig.text.includes("かかり"), "textに「かかり」を含む: " + sig.text);
    assert.ok(!/薄い|裏付けがありません|ズレます/.test(sig.text), "偽宣言・警告文言を含まない: " + sig.text);
    console.log("PASS (a): 報告局の再現fixtureでkakari_gotae(肯定表示)と判定され、kyo2の赤警告が出ない");
  }

  // ---- (b) 回帰: 相方の香攻めが無い局面で香1枚リード → 従来どおりkyo2・不正直 ----
  {
    const initialHands = {N: ["馬"], W: ["馬"], S: ["香", "馬", "角", "銀", "飛", "金", "し", "し"], E: ["馬"]};
    const moves = [
      {seat: "S", human: true, action: {type: "bury", koma: "馬"}},
      {seat: "S", human: true, action: {type: "attack", koma: "香"}},
    ];
    const rec = baseRec("S", moves, initialHands);
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.ok(sig, "signalが検出される");
    assert.strictEqual(sig.type, "kyo2", "相方の香攻め履歴が無ければ従来どおりkyo2: " + JSON.stringify(sig));
    assert.strictEqual(sig.honest, false, "香1枚保有は不正直のまま(回帰なし)");
    console.log("PASS (b): 相方の香攻めが無い局面での香1枚リードは従来どおりkyo2・不正直(回帰なし)");
  }

  // ---- (c) 回帰: 同、香2枚リード → kyo2・正直 ----
  {
    const initialHands = {N: ["馬"], W: ["馬"], S: ["香", "香", "角", "銀", "飛", "金", "し", "し"], E: ["馬"]};
    const moves = [
      {seat: "S", human: true, action: {type: "bury", koma: "馬"}},
      {seat: "S", human: true, action: {type: "attack", koma: "香"}},
    ];
    const rec = baseRec("S", moves, initialHands);
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.strictEqual(sig.type, "kyo2");
    assert.strictEqual(sig.honest, true, "香2枚保有はhonestのまま(回帰なし)");
    console.log("PASS (c): 香2枚リードは従来どおりkyo2・正直(回帰なし)");
  }

  // ---- (d) 金での対称確認: 相方が金をリード後、人間が金1枚で応え → kakari_gotae(kgb_pair偽宣言にならない) ----
  {
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
      {type: "attack", koma: "金"},                               // S: attack#3 = かかり応え
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    moves[moves.length - 1].human = true;
    const rec = baseRec("N", moves, initialHands);
    T.computeSignals(rec);
    const sig = rec.moves[rec.moves.length - 1].sig;
    assert.ok(sig, "signalが検出される");
    assert.strictEqual(sig.type, "kakari_gotae", "金でもkgb_pairではなくkakari_gotaeと判定される(対称性): " + JSON.stringify(sig));
    assert.strictEqual(sig.honest, true);
    console.log("PASS (d): 金のかかり応えも対称にkakari_gotaeと判定される(kgb_pair偽宣言にならない)");
  }

  // ---- (e) detectSignal単体: 相方が同駒を攻め済み → null (金銀馬・香の両窓で) ----
  {
    const histWithPartnerAttackKyo = [{seat: "N", act: "attack", koma: "香"}];
    const sigKyo = T.detectSignal({history: histWithPartnerAttackKyo}, "S", {type: "attack", koma: "香"});
    assert.strictEqual(sigKyo, null, "相方(N)が香を攻め済みならdetectSignalはnull(香窓): " + JSON.stringify(sigKyo));

    const histWithPartnerAttackKin = [{seat: "N", act: "attack", koma: "金"}];
    const sigKin = T.detectSignal({history: histWithPartnerAttackKin}, "S", {type: "attack", koma: "金"});
    assert.strictEqual(sigKin, null, "相方(N)が金を攻め済みならdetectSignalはnull(金銀馬窓): " + JSON.stringify(sigKin));

    // 対照: 敵(E)が同駒を攻めていても除外されない(相方限定であることの確認)
    const histWithEnemyAttack = [{seat: "E", act: "attack", koma: "香"}];
    const sigEnemy = T.detectSignal({history: histWithEnemyAttack}, "S", {type: "attack", koma: "香"});
    assert.ok(sigEnemy, "敵(E)の同駒攻めは除外対象外(相方限定): " + JSON.stringify(sigEnemy));
    assert.strictEqual(sigEnemy.signal_type, "kyo2");
    console.log("PASS (e): detectSignal単体 — 相方の同駒攻め済みはnull(金銀馬・香とも)、敵の攻めは除外対象外");
  }

  // ---- (f) NULLコントロール: sighonest OFFで mv.sig === undefined ----
  {
    app.cfg.sighonest = false;
    const initialHands = {N: ["馬"], W: ["馬"], S: ["香", "香", "角", "銀", "飛", "金", "し", "し"], E: ["馬"]};
    const moves = [
      {seat: "S", human: true, action: {type: "bury", koma: "馬"}},
      {seat: "S", human: true, action: {type: "attack", koma: "香"}},
    ];
    const rec = baseRec("S", moves, initialHands);
    T.computeSignals(rec);
    assert.strictEqual(rec.moves[1].sig, undefined, "sighonest OFFではmv.sigが設定されない(完全旧挙動)");
    app.cfg.sighonest = true;
    console.log("PASS (f): NULLコントロール(sighonest OFF)でmv.sigは未設定のまま");
  }

  // ---- (g) し攻め監査(F-3)非干渉: v90.3の変更後もF-3のshi_sig分岐が従来どおり動作する ----
  {
    const moves = [
      {seat: "S", human: true, action: {type: "bury", koma: "し"}},
      {seat: "S", human: true, action: {type: "attack", koma: "し"}},
    ];
    const rec = baseRec("S", moves, {N: ["馬"], W: ["馬"], S: ["し", "し", "し", "し", "角", "銀", "飛", "香"], E: ["馬"]});
    T.computeSignals(rec);
    const sig = rec.moves[1].sig;
    assert.ok(sig, "し攻めのsigが検出される");
    assert.strictEqual(sig.type, "shi_sig", "F-3のshi_sig分岐は非干渉(kakari_gotaeやkyo2にならない): " + JSON.stringify(sig));
    assert.strictEqual(sig.honest, true, "し4枚(3+伏せ1)はhonestのまま(F-3の挙動不変)");
    console.log("PASS (g): F-3(し攻め監査)はv90.3の変更後も非干渉で従来どおり動作する");
  }

  console.log("ALL GOTAE TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
