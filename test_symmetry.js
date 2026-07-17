const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// 常設の対称性回帰テスト(v92a, PLAN_v92_consistency.md): 同一fixtureを「エンジンの読み手」
// (G.kakariGotae / G.shiStarted・G.partnerSignaledShi・G.detectOuSignals / G.inferPartnerHoldings)と
// 「UI監査」(detectSignal / computeSignals / auditOppProfile / auditOuShiSignal)の両方に通し、
// 判定が食い違わないことを機械確認する。M-1・M-6のように、UI監査だけがエンジンの読みに追随できず
// 食い違う(=再発しうる)類のバグの再発防止資産として、今後もこのファイルへ対称性チェックを追加していく。
//
// 最低カバー(計画書どおり):
//   1) かかり応え文脈: エンジン読み(G.kakariGotae)⇔detectSignalの新規符丁除外⇔auditOppProfileの
//      「騙し単騎」除外(M-1)
//   2) 王合図: 送り手条件(G.shiStarted/G.partnerSignaledShi)⇔読み手(G.detectOuSignals)⇔
//      UI監査(auditOuShiSignal)
//   3) し宣言shiN: UI監査(auditOuShiSignal経由のcomputeSignals・M-6)⇔エンジンの保有読みの意味論
//      (G.inferPartnerHoldingsの「元保有4」読み)
//
// 注: 王合図の「送り手条件」はouOn/ouSignalContextNow/ouMixDraw/enemyLikelyHoldsUncutなど非公開の
// 内部関数を多数合成した最終判断であり、ここでは計画書が名指しする公開済みのガード条件プリミティブ
// (G.shiStarted・G.partnerSignaledShi)のみを対象とする。
//
// v92c(M-11/M-12)で追加: 4) 王合図の送り手条件(shiStarted/partnerSignaledShi)⇔読み手3系統
// (detectOuSignals/partnerSignaledOu/inferPartnerHoldingsのouCtx)⇔UI監査(auditOuShiSignal)の対称性
// (以前は読み手に文脈ガードがなく監査が誤警告していた=M-11で解消)。
// 5) kakariGotae(香応え窓ac<=8)⇔inferPartnerHoldingsの香registration窓(M-12c)の一致(以前は窓なしで
// 常時登録=M-12で解消)。詳細な数値境界の網羅はtest_v92c_engine.jsに集約する。

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
  const app = T.app;
  const G = T.G;

  app.cfg.sighonest = true;

  // ========================================================================
  // 1) かかり応え文脈: G.kakariGotae(読み手) ⇔ detectSignal(新規符丁除外) ⇔
  //    auditOppProfile(騙し単騎除外・M-1)
  // ========================================================================
  {
    app.humanSeat = "S";
    // test_v92_oppaudit.js (a)と同一fixture: 相方(N)が金をリード(かかり)、南(唯一の金保持)が
    // 独立した攻め番(受けの直後)で金を攻める(応え)。
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
    const idx = moves.length - 1;
    assert.strictEqual(rec.moves[idx].seat, "S", "前提: 最後の手はSのかかり応え(金)");
    assert.strictEqual(rec.moves[idx].action.koma, "金");

    // (1) エンジンの読み手: kakariGotaeはSの金かかり応えを推奨する
    const stBefore = T.rebuildState(rec, idx);   // 応え手そのものを含まない「手番前」の状態
    const gotae = G.kakariGotae({seat: "S", hand: stBefore.hands.S, hist: stBefore.history});
    assert.strictEqual(gotae, "金", "エンジンの読み手(kakariGotae)はSの金かかり応えを推奨する");

    // (2) 読み手(detectSignal): 同じ手を新規符丁とは誤検出しない(kakariGotaeのリード限定除外と対称)
    const detected = T.detectSignal(stBefore, "S", {type: "attack", koma: "金"});
    assert.strictEqual(detected, null,
      "detectSignalは応え文脈のこの攻めを新規符丁と誤検出しない(kakariGotaeの除外と対称)");

    // (3) UI監査(computeSignals): 同じ手をkakari_gotaeとして肯定判定する(内部でG.kakariGotaeを共有)
    rec.moves[idx].human = true;
    T.computeSignals(rec);
    const sig = rec.moves[idx].sig;
    assert.ok(sig, "computeSignalsがsigを設定する");
    assert.strictEqual(sig.type, "kakari_gotae", "UI監査もかかり応えとして判定する(エンジン読みと一致)");
    assert.strictEqual(sig.honest, true);

    // (4) auditOppProfile(M-1): 同じ応え文脈の攻めを「騙し単騎」候補から除外する
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    T.auditOppProfile(rec);
    assert.strictEqual(app.oppCounts.bl.n, 0,
      "auditOppProfileも同じ応え文脈をbl候補から除外する(M-1: エンジン読み/detectSignalとの対称性): " +
      JSON.stringify(app.oppCounts.bl));

    console.log("PASS (1): かかり応え文脈でG.kakariGotae⇔detectSignal⇔auditOppProfile(M-1)が一致する");
  }

  // ========================================================================
  // 1b) FIX(REVIEW Must-fix1): 相方の香リードが攻め通し5〜7(旧auditOppProfileのac<=4窓の外)でも、
  //     detectSignal(窓なし=履歴全体で相方の同駒攻めの有無を見る) ⇔ auditOppProfile(M-1の騙し単騎除外)
  //     が一致する。kak収集からac<=4窓を外す前は、この場合だけauditOppProfileがdetectSignalと食い違い
  //     (detectSignalはnull=応えと認識するのに、auditOppProfileはbl.n/bl.kに計上してしまう)、
  //     まさにこのレビュー指摘そのものの対称性破れだった。
  //     (G.kakariGotaeはpartnerの「最初の攻め」1回のみを見る別の意味論(M-12/v92cの既知の別論点。
  //     本Must-fixのkak収集とは異なる変数・異なる窓を持つエンジン側のkakSetの話であり範囲外)のため、
  //     ここでは対象に含めない。detectSignalとauditOppProfileの2者対称性のみを検証する)。
  // ========================================================================
  {
    app.humanSeat = "S";
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
      {type: "attack", koma: "香"},                                // N: attack#5=香 [ac=5] ← 旧窓の外の香リード
      {type: "pass"}, {type: "pass"}, {type: "pass"},              // W,S,E全パス -> Nが攻め直し
      {type: "bury", koma: "し"}, {type: "attack", koma: "し"},    // N: attack#6=し [ac=6]
      {type: "pass"},                                               // W pass
      {type: "receive", koma: "し"},                                // S受け -> Sが攻め手番に(伏せなし)
      {type: "attack", koma: "香"},                                 // S: attack#7=香 [ac=7] ← 単騎香かかり応え
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    const rec = baseRec("N", moves, initialHands);
    const idx = moves.length - 1;
    assert.strictEqual(rec.moves[idx].seat, "S", "前提: 最後の手はSの単騎香かかり応え");
    assert.strictEqual(rec.moves[idx].action.koma, "香");

    // (1) 読み手(detectSignal・窓なし): 相方(N)がこの履歴のどこかで香を攻めていれば(ac不問)
    //     応え文脈と認識し、新規符丁とは判定しない
    const stBefore = T.rebuildState(rec, idx);
    const detected = T.detectSignal(stBefore, "S", {type: "attack", koma: "香"});
    assert.strictEqual(detected, null,
      "detectSignalは相方の香リードがac5〜7でも(窓なし)応え文脈として新規符丁と誤検出しない");

    // (2) auditOppProfile(M-1・FIX後): 同じ応えをbl候補から除外する(修正前はkak収集がac<=4窓に
    //     ゲートされていたため、この場合だけdetectSignalと食い違いbl.n/bl.kに誤計上していた)
    app.oppCounts = {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}, blV: 1};
    T.auditOppProfile(rec);
    assert.strictEqual(app.oppCounts.bl.n, 0,
      "auditOppProfileもdetectSignalと一致してbl候補から除外する(REVIEW Must-fix1): " +
      JSON.stringify(app.oppCounts.bl));
    assert.strictEqual(app.oppCounts.bl.k, 0,
      "同上・bl.kも計上されない: " + JSON.stringify(app.oppCounts.bl));

    console.log("PASS (1b): 相方の香リードが攻め通し5〜7でも、detectSignal⇔auditOppProfile(M-1のFIX後)が一致する(REVIEW Must-fix1)");
  }

  // ========================================================================
  // 2) 王合図: 送り手条件(G.shiStarted/G.partnerSignaledShi) ⇔ 読み手(G.detectOuSignals) ⇔
  //    UI監査(auditOuShiSignal)
  // ========================================================================
  function ouSigFixture(seat, partner, honestHand) {
    const hist = [
      {seat, act: "attack", koma: "香"},           // ac=1: pFirst="香", pFirstAc=1
      {seat: partner, act: "attack", koma: "金"},  // ac=2
      {seat: partner, act: "attack", koma: "金"},  // ac=3
      {seat: partner, act: "attack", koma: "金"},  // ac=4
    ];
    const st = {hands: {[seat]: honestHand}, history: hist};
    const mv = {seat, human: true, action: {type: "attack", koma: "し"}};
    const rec = {gameNo: 1, moves: [], result: null, initialHands: null, parent: seat};
    return {rec, st, mv};
  }
  {
    const seat = "S", partner = "N";
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);

    // 送り手条件(計画書が名指しする公開プリミティブ): まだ本物のし攻めにコミットしておらず、
    // 相方もまだし合図していない、という送信資格そのもの
    assert.strictEqual(G.shiStarted(st.history, seat), false,
      "送り手条件: shiStarted=false(この後のし攻めがまだ本物のし攻めにコミットされていない)");
    assert.strictEqual(G.partnerSignaledShi(st.history, seat), false,
      "送り手条件: partnerSignaledShi=false(相方はまだし合図していない)");

    // 読み手(エンジン): 送り手条件を満たすこの後続し攻めを王合図として検出する
    const histInc = st.history.concat([{seat, koma: "し", act: "attack"}]);
    const ouIdx = G.detectOuSignals(histInc, seat);
    assert.ok(Array.isArray(ouIdx) && ouIdx.indexOf(histInc.length - 1) >= 0,
      "detectOuSignalsは送り手条件を満たすこの手を王合図として検出する: " + JSON.stringify(ouIdx));

    // UI監査(auditOuShiSignal): 同じdetectOuSignals呼び出しを内部で共有し、一致した判定を返す
    app.cfg.ouSignal = true;
    app.convTrust = {n: 10, ok: 8};   // convTrustVal=0.75>=OUSIG_TRUST_READ
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(sig, "auditOuShiSignalがsigを返す");
    assert.strictEqual(sig.type, "ou_sig",
      "UI監査も送り手条件成立時のこの手を王合図として判定する(送り手条件⇔監査の対称性)");
    assert.strictEqual(sig.honest, true, "王を保有しているのでhonest");

    console.log("PASS (2): 王合図の送り手条件(G.shiStarted/G.partnerSignaledShi)⇔読み手(G.detectOuSignals)⇔UI監査(auditOuShiSignal)が一致する");
  }

  // ========================================================================
  // 3) し宣言shiN: UI監査(auditOuShiSignal経由・M-6) ⇔ エンジンの保有読みの意味論
  //    (G.inferPartnerHoldingsの「元保有4」読み)
  // ========================================================================
  {
    // test_v92_shiuke.js (a)と同一fixture: し4枚→し受け→初攻めし
    const initialHands = {
      N: ["し", "馬", "角", "飛", "王", "銀", "香", "金"],
      W: ["角"],
      S: ["し", "し", "し", "し", "角", "銀", "飛", "香"],
      E: ["角"],
    };
    const actions = [
      {type: "bury", koma: "馬"}, {type: "attack", koma: "し"},   // N: attack#1(Sの受けを作るための布石)
      {type: "pass"},                                              // W pass(しを持たない)
      {type: "receive", koma: "し"},                               // S receive(し消費) -> Sがそのまま攻め手番
      {type: "attack", koma: "し"},                                // S: 初攻め(firstAtk) = し
    ];
    const moves = playSequence(G, initialHands, "N", actions);
    moves[moves.length - 1].human = true;
    const rec = baseRec("N", moves, initialHands, {winner: "S"});

    // UI監査(computeSignals経由でauditOuShiSignalのshiN判定・M-6): 受けたし込みで4枚→honest
    T.computeSignals(rec);
    const mv = moves[moves.length - 1];
    assert.strictEqual(mv.sig.type, "shi_sig");
    assert.strictEqual(mv.sig.honest, true,
      "UI監査: 受けたし込みでshiN=4→honest(M-6): " + JSON.stringify(mv.sig));

    // エンジンの保有読み(相方Nの視点でSの保有を推定): 同一局面のhistを使う。
    // pFirst==="し"自体(このSの初攻めがまさにpFirst)なのでouCtx不成立(ac<=4のため両分岐とも不成立)、
    // よってinferPartnerHoldingsは「元保有4」と読む。受けで1枚消費した事実はここでは減算されない
    // (エンジンの読みは「宣言＝保有4」という意味論そのものであり、UI監査のshiN計算はこれに揃えて
    // 受けたしを保有側へ足し戻す形でM-6を実装した。両者が最終的に「4」で一致することを確認する)。
    const stAfter = T.rebuildState(rec, rec.moves.length);
    const inf = G.inferPartnerHoldings(stAfter.history, "S");
    assert.strictEqual(inf["し"], 4,
      "エンジンの保有読みも同じ宣言をし4枚と信頼する(UI監査のhonest判定と同じ意味論・M-6): " + JSON.stringify(inf));

    console.log("PASS (3): し宣言shiNでUI監査(auditOuShiSignal・M-6)⇔エンジンの保有読み(G.inferPartnerHoldings)が一致する");
  }

  // ========================================================================
  // 4) v92c(M-11): 王合図の送り手条件(G.shiStarted/G.partnerSignaledShi)がし攻め文脈を示す時、
  //    読み手3系統(G.detectOuSignals/G.partnerSignaledOu/G.inferPartnerHoldings)とUI監査
  //    (auditOuShiSignal)の全てが「王合図ではない」で一致すること。修正前は読み手に文脈ガードが
  //    なく、送り手が正当と見なすし攻め参加を監査だけが「⚠偽の王合図です」と誤警告していた
  //    (UIの一方が推奨した行動を他方が処罰する自己矛盾)。
  // ========================================================================
  {
    app.cfg.ouSignal = true;
    app.convTrust = {n: 10, ok: 10};   // convTrustVal=1.0
    const seat = "S", partner = "N";
    // 相方(N)がし攻め合図(初攻め=し)、自分(S)は1巡目に香を攻め、2巡目のしが「1巡目香→2巡目し」の
    // 王合図窓に該当する形。送り手条件はpartnerSignaledShi=trueで「し攻め文脈に正当参加」を示す。
    const hist = [
      {seat: partner, act: "attack", koma: "し"},   // ac1
      {seat, act: "attack", koma: "香"},              // ac2 (pFirst=香,pFirstAc=2)
      {seat: "W", act: "attack", koma: "金"},         // ac3
      {seat: "E", act: "attack", koma: "銀"},         // ac4
    ];
    assert.strictEqual(G.shiStarted(hist, seat), false);
    assert.strictEqual(G.partnerSignaledShi(hist, seat), true,
      "送り手条件: partnerSignaledShi=true(相方のし攻め合図に正当参加できる文脈)");

    const histInc = hist.concat([{seat, koma: "し", act: "attack"}]);

    // 読み手1: detectOuSignals — 王合図として検出しない
    // (注: Gはjsdomの別レルムでロードされるため、配列比較はassert.deepStrictEqualでなく
    //  length/JSON.stringifyで行う。既存の(2)と同じ回避パターン)
    const ouIdx = G.detectOuSignals(histInc, seat);
    assert.strictEqual(ouIdx.length, 0,
      "読み手(detectOuSignals)は送り手条件と対称にこの手を王合図と読まない: " + JSON.stringify(ouIdx));

    // 読み手2: partnerSignaledOu(相方視点で同じ手を見た場合も対称)
    assert.strictEqual(G.partnerSignaledOu(histInc, seat), false,
      "読み手(partnerSignaledOu)も送り手条件と対称に王合図と読まない");

    // 読み手3: inferPartnerHoldings — ouCtxを立てずし保有として読む
    const inf = G.inferPartnerHoldings(histInc, seat);
    assert.strictEqual(inf["王"], undefined, "読み手(inferPartnerHoldings)も王合図(ouCtx)を立てない");
    assert.strictEqual(inf["し"], 4, "読み手(inferPartnerHoldings)はし攻め参加として保有を読む");

    // UI監査: auditOuShiSignal — detectOuSignalsを内部で共有するため、王合図(⚠含む)を主張しない
    const st = {hands: {[seat]: ["し", "角", "銀", "飛"]}, history: hist};
    const mv = {seat, human: true, action: {type: "attack", koma: "し"}};
    const rec = {gameNo: 1, moves: [], result: null, initialHands: null, parent: seat};
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.strictEqual(sig, null,
      "UI監査(auditOuShiSignal)も王合図を主張しない(送り手条件⇔読み手3系統⇔UI監査の対称性): " + JSON.stringify(sig));

    console.log("PASS (4): M-11 — 王合図の送り手条件⇔読み手3系統(detectOuSignals/partnerSignaledOu/inferPartnerHoldings)⇔UI監査(auditOuShiSignal)が対称に一致する");
  }

  // ========================================================================
  // 5) v92c(M-12): kakariGotae(香応え窓ac<=8) ⇔ inferPartnerHoldingsの香registration窓(M-12c)の
  //    一致。修正前はinferPartnerHoldings側に窓が無く、kakariGotaeが「応え対象外(null)」と判定する
  //    ac>8の香攻めでも保有を登録してしまう非対称があった。
  // ========================================================================
  {
    // 相方(N)の香攻めが「リード」でもac<=8窓内でもない(ac9)よう、自席(S)・敵(W)で8手埋める
    const hist = [];
    for (let i = 0; i < 4; i++) hist.push({seat: "S", act: "attack", koma: "し"}, {seat: "W", act: "attack", koma: "銀"});
    hist.push({seat: "N", act: "attack", koma: "香"});   // ac9: Nの初攻め=香だが窓の外
    const view = {seat: "S", hand: ["角", "飛", "香"], hist};

    const gotae = G.kakariGotae(view);
    assert.strictEqual(gotae, null, "前提: kakariGotaeはac9の香リードを応え対象外と判定する(窓ac<=8の外)");

    const inf = G.inferPartnerHoldings(hist, "N");
    assert.strictEqual(inf["香"], undefined,
      "M-12: inferPartnerHoldingsもkakariGotaeと同じac<=8窓で香registrationを止める(対称性): " + JSON.stringify(inf));

    console.log("PASS (5): M-12 — kakariGotae(香応え窓ac<=8)⇔inferPartnerHoldingsの香registration窓が一致する");
  }

  console.log("ALL SYMMETRY TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
