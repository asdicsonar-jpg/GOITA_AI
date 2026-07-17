// test_v92c_engine.js — v92c「エンジン対称化」(M-11/M-12/M-13, PLAN_v92_consistency.md)の機械証明。
// エンジン(G/G_B)はDOM/グローバル参照ゼロの純粋JSのため、jsdomを介さずtests/ab/load_engine.jsで
// 直接ロードして検証する(高速・決定的)。fail-before確認は個別に
// tests/ab/_failbefore_v92c.js(build/v91bc/src/index.htmlを対象に同一アサーションを実行し、
// 修正前は失敗することを確認するスクリプト)で行う。詳細はIMPLEMENTATION_REPORT_v92c.md参照。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { extractSlice } = require("./ab/engine_extract.js");
const { loadEnginesFromFile, evalEngineText } = require("./ab/load_engine.js");

const SRC = path.join(__dirname, "..", "src", "index.html");
const { G, G_B } = loadEnginesFromFile(SRC);
G.setOuSignal(true);
G_B.setOuSignal(true);

// firstAtkEvidenceは公開APIに含まれない内部関数のため、テスト専用に一度だけ「pairAttackEvidence,」の
// 直後へ「firstAtkEvidence,」を追加した計装コピーをロードする(本番の公開APIは不変のまま)。
function loadInstrumentedG(srcPath) {
  const src = fs.readFileSync(srcPath, "utf-8");
  const text = extractSlice(src, "G").text;
  const marker = "setKPairEv, pairAttackEvidence,";
  const count = text.split(marker).length - 1;
  assert.strictEqual(count, 1, "計装マーカーがG内にちょうど1回見つかること(公開API文言の変化検知)");
  const instrumented = text.split(marker).join("setKPairEv, pairAttackEvidence, firstAtkEvidence,");
  return evalEngineText(instrumented, "G");
}
const Gi = loadInstrumentedG(SRC);
Gi.setOuSignal(true);

(() => {
  // ==========================================================================
  // (a) M-11: 王合図の読み手3系統(detectOuSignals / partnerSignaledOu / inferPartnerHoldings)に
  //     し攻め文脈ガードが効くこと(文脈中は読まない)、および非文脈では従来どおり読むこと(回帰)。
  // ==========================================================================

  // --- (a-1) 文脈あり(partnerSignaledShi=true): 王合図と読まれない ---
  // N(partner)が最初の攻めでし攻めをリード -> partnerSignaledShi(prefix,S)=true。
  // S(seat)自身は1巡目に香を攻め(pFirst=香,pFirstAc=2)、2巡目のし(ac=5)は「1巡目香→2巡目し」の
  // 王合図窓(ac>4&&ac<=8&&pFirst===香&&pFirstAc<=4)に該当するが、これは相方のし攻めへの正当な
  // 参加であり王合図ではない。
  {
    const prefix = [
      {seat: "N", act: "attack", koma: "し"},   // ac1: 相方の初攻めし(し攻め合図)
      {seat: "S", act: "attack", koma: "香"},   // ac2: 自分の初攻め=香 (pFirst=香,pFirstAc=2)
      {seat: "W", act: "attack", koma: "金"},   // ac3: 敵の埋め
      {seat: "E", act: "attack", koma: "銀"},   // ac4: 敵の埋め
    ];
    assert.strictEqual(G.shiStarted(prefix, "S"), false, "前提: shiStarted=false");
    assert.strictEqual(G.partnerSignaledShi(prefix, "S"), true, "前提: partnerSignaledShi=true(相方のし攻め合図)");

    const full = prefix.concat([{seat: "S", act: "attack", koma: "し"}]);   // ac5: 候補のし

    const idxs = G.detectOuSignals(full, "S");
    assert.deepStrictEqual(idxs, [], "M-11: detectOuSignalsはし攻め文脈中のしを王合図と読まない(送り手と対称)");

    const sig = G.partnerSignaledOu(full, "S");
    assert.strictEqual(sig, false, "M-11: partnerSignaledOuもし攻め文脈中は王合図と読まない");

    const inf = G.inferPartnerHoldings(full, "S");
    assert.strictEqual(inf["王"], undefined, "M-11: inferPartnerHoldingsは王合図ouCtxを立てない(し攻め文脈中)");
    assert.strictEqual(inf["し"], 4, "M-11: 代わりにし4枚保有と正しく読む(打ち止め合図ではなく本物のし攻め)");

    console.log("PASS (a-1): M-11 — し攻め文脈中(partnerSignaledShi)のしは3読み手いずれも王合図と読まない");
  }

  // --- (a-1b) 王合図の別窓(「3巡目のし」ac>8&&ac<=12&&pFirst!=="し")でも文脈ガードが効くことを確認。
  //     (a-1)は「1巡目香→2巡目し」窓(pFirst===香)だったため、もう一方の窓も独立に確認する。
  {
    const prefix = [
      {seat: "N", act: "attack", koma: "し"},   // ac1: 相方の初攻めし(し攻め合図)
      {seat: "S", act: "attack", koma: "金"},   // ac2: 自分の初攻め=金(pFirst=金、し以外なら窓条件は満たす)
    ];
    for (let i = 0; i < 3; i++) prefix.push({seat: "W", act: "attack", koma: "銀"}, {seat: "E", act: "attack", koma: "馬"});
    // ここまでac=8。partnerSignaledShi(prefix,S)=true・shiStarted(prefix,S)=false(pFirst=金のため)。
    assert.strictEqual(G.shiStarted(prefix, "S"), false);
    assert.strictEqual(G.partnerSignaledShi(prefix, "S"), true, "前提: 相方のし攻め合図が継続中");

    const full = prefix.concat([{seat: "S", act: "attack", koma: "し"}]);   // ac9: 「3巡目のし」窓に該当

    assert.deepStrictEqual(G.detectOuSignals(full, "S"), [],
      "M-11: 『3巡目のし』窓(ac>8)でも、し攻め文脈中は王合図と読まない");
    assert.strictEqual(G.partnerSignaledOu(full, "S"), false,
      "M-11: partnerSignaledOuも同窓で文脈ガードが効く");
    const inf = G.inferPartnerHoldings(full, "S");
    assert.strictEqual(inf["王"], undefined, "M-11: inferPartnerHoldingsもこの窓で王合図と読まない");
    assert.strictEqual(inf["し"], 4, "M-11: 代わりにし4枚保有と読む");

    console.log("PASS (a-1b): M-11 — 『3巡目のし』窓(ac>8)でも文脈ガードが3読み手いずれにも効く");
  }

  // --- (a-2) 非文脈: 相方がし合図していない(金でリード)場合は従来どおり王合図と読む(回帰) ---
  {
    const prefix = [
      {seat: "N", act: "attack", koma: "金"},   // ac1: 相方は金でリード(し合図でない)
      {seat: "S", act: "attack", koma: "香"},   // ac2: 自分の初攻め=香
      {seat: "W", act: "attack", koma: "金"},   // ac3
      {seat: "E", act: "attack", koma: "銀"},   // ac4
    ];
    assert.strictEqual(G.shiStarted(prefix, "S"), false);
    assert.strictEqual(G.partnerSignaledShi(prefix, "S"), false, "前提: 相方は金リードのためし合図なし");

    const full = prefix.concat([{seat: "S", act: "attack", koma: "し"}]);   // ac5

    const idxs = G.detectOuSignals(full, "S");
    assert.deepStrictEqual(idxs, [4], "回帰: 非文脈では従来どおりdetectOuSignalsが王合図として検出する");

    const sig = G.partnerSignaledOu(full, "S");
    assert.strictEqual(sig, true, "回帰: 非文脈では従来どおりpartnerSignaledOuがtrue");

    const inf = G.inferPartnerHoldings(full, "S");
    assert.strictEqual(inf["王"], 1, "回帰: 非文脈では従来どおりinferPartnerHoldingsが王合図(ouCtx)と読む");
    assert.strictEqual(inf["し"], undefined, "回帰: この場合inf[し]は立たない(王合図解釈が優先)");

    console.log("PASS (a-2): M-11 — 非文脈(相方が金リード等)では3読み手とも従来どおり王合図と読む(回帰なし)");
  }

  // --- (a-3) G_B側も同一diffであることの直接確認 ---
  {
    const prefix = [
      {seat: "N", act: "attack", koma: "し"},
      {seat: "S", act: "attack", koma: "香"},
      {seat: "W", act: "attack", koma: "金"},
      {seat: "E", act: "attack", koma: "銀"},
    ];
    const full = prefix.concat([{seat: "S", act: "attack", koma: "し"}]);
    assert.deepStrictEqual(G_B.detectOuSignals(full, "S"), [], "M-11はG_Bにも同一diffで適用されている(detectOuSignals)");
    assert.strictEqual(G_B.partnerSignaledOu(full, "S"), false, "M-11はG_Bにも同一diffで適用されている(partnerSignaledOu)");
    assert.strictEqual(G_B.inferPartnerHoldings(full, "S")["し"], 4, "M-11はG_Bにも同一diffで適用されている(inferPartnerHoldings)");
    console.log("PASS (a-3): M-11 — G_Bも同一diffで王合図の文脈ガードが効く");
  }
})();

(() => {
  // ==========================================================================
  // (b) M-12: 香のかかり文脈窓の対称化(ac<=4 → 香のみac<=8)
  // ==========================================================================

  // --- (b-1) inferPartnerHoldings: 自分(me)の香リードがac5〜7(旧ac<=4窓の外)でも、
  //     相方(partner)の後続香攻めをpairN=1(かかり応え文脈)で読む(修正前はpairN=2=自発ペア扱い) ---
  {
    const hist = [
      {seat: "W", act: "attack", koma: "飛"},   // ac1
      {seat: "E", act: "attack", koma: "角"},   // ac2
      {seat: "W", act: "attack", koma: "飛"},   // ac3
      {seat: "E", act: "attack", koma: "角"},   // ac4
      {seat: "S", act: "attack", koma: "香"},   // ac5: 自分(me=S)の香リード。旧ac<=4窓の外
      {seat: "N", act: "attack", koma: "香"},   // ac6: 相方(N)の香攻め。かかり応え文脈のはず
    ];
    const inf = G.inferPartnerHoldings(hist, "N");
    assert.strictEqual(inf["香"], 1,
      "M-12(a): 自分の香リードがac5〜7でもkakSetに拾われ、相方の香攻めをpairN=1(単騎応え)と読む: " + JSON.stringify(inf));
    console.log("PASS (b-1): M-12(a) — inferPartnerHoldingsのkakSet収集がac<=8(香)に対称化されている");
  }

  // --- (b-1c) 香ペア読みの窓(ac<=8)を追加: ac9以降の香攻めからはinf["香"]が立たない(修正前は立つ) ---
  {
    const hist = [];
    for (let i = 0; i < 4; i++) hist.push({seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"});
    // ここまでac=1..8(埋め)。相方の香攻めをac9で発生させる。
    hist.push({seat: "N", act: "attack", koma: "香"});   // ac9
    const inf = G.inferPartnerHoldings(hist, "N");
    assert.strictEqual(inf["香"], undefined,
      "M-12(c): ac9以降の香攻めからはinf[香]が立たない(kakariGotae/detectSignalと同じac<=8窓に揃えた): " + JSON.stringify(inf));
    console.log("PASS (b-1c): M-12(c) — 香ペア読みにac<=8窓が入り、窓外では推定しない");
  }

  // --- (b-1c-regress) ac<=8の範囲内(ac8ちょうど)では従来どおり読む(回帰) ---
  {
    const hist = [];
    for (let i = 0; i < 3; i++) hist.push({seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"});
    hist.push({seat: "W", act: "attack", koma: "飛"});   // ac7
    hist.push({seat: "N", act: "attack", koma: "香"});   // ac8(境界値・窓内)
    const inf = G.inferPartnerHoldings(hist, "N");
    assert.strictEqual(inf["香"], 2, "回帰: ac8ちょうど(窓内)ではkakSetなしなら従来どおりpairN=2で読む: " + JSON.stringify(inf));
    console.log("PASS (b-1c-regress): M-12(c) — ac<=8境界内では従来どおり読む(回帰なし)");
  }

  // --- (b-2) firstAtkEvidenceのkc収集も同じ窓(ac<=8)に対称化されている(計装コピーで直接検証) ---
  {
    const hist = [
      {seat: "W", act: "attack", koma: "飛"},   // ac1
      {seat: "E", act: "attack", koma: "角"},   // ac2
      {seat: "W", act: "attack", koma: "飛"},   // ac3
      {seat: "E", act: "attack", koma: "角"},   // ac4
      {seat: "S", act: "attack", koma: "香"},   // ac5: Sの香攻め(ac<=4窓の外)
      {seat: "N", act: "attack", koma: "香"},   // ac6: Sの相方Nの香攻め -> kc=trueのはず
    ];
    const ev = Gi.firstAtkEvidence({seat: "X", hist});
    const nEv = ev.find(e => e.seat === "N" && e.koma === "香");
    assert.ok(nEv, "firstAtkEvidenceがNの香攻めを記録する");
    assert.strictEqual(nEv.kc, true,
      "M-12(b): firstAtkEvidenceのkc収集もac<=8(香)に対称化され、Sのac5香攻めをかかり文脈として拾う: " + JSON.stringify(ev));
    console.log("PASS (b-2): M-12(b) — firstAtkEvidenceのkc収集がac<=8(香)に対称化されている");
  }

  // --- (b-3) G_B側も同一diff ---
  {
    const hist = [
      {seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"},
      {seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"},
      {seat: "S", act: "attack", koma: "香"}, {seat: "N", act: "attack", koma: "香"},
    ];
    const inf = G_B.inferPartnerHoldings(hist, "N");
    assert.strictEqual(inf["香"], 1, "M-12はG_Bにも同一diffで適用されている(kakSet ac<=8)");
    console.log("PASS (b-3): M-12 — G_Bも同一diffで香窓が対称化されている");
  }
})();

(() => {
  // ==========================================================================
  // (c) M-13: 王2香1初攻めの局面(騙し香が発火する局面)で、Gは騙し香を返し、G_Bは
  //     (Planner裁定どおり)COOP_SIGNALのon/off両方で騙し香を返さない。
  // ==========================================================================
  function buildDeal() {
    // S: 王2・香1・し4・金1(bury前・isDamashiKyou成立形) / 残りは他3席へ整合的に配る
    return {
      S: ["王", "王", "香", "し", "し", "し", "し", "金"],
      N: ["飛", "飛", "角", "角", "金", "金", "金", "銀"],
      W: ["銀", "銀", "銀", "馬", "馬", "馬", "馬", "香"],
      E: ["香", "香", "し", "し", "し", "し", "し", "し"],
    };
  }
  function decide(engine, coop) {
    if (typeof engine.setCoopSignal === "function") engine.setCoopSignal(!!coop);
    const st = engine.newGameState(buildDeal(), "S");
    engine.advance(st, {type: "bury", koma: "金"});   // S伏せ -> 手駒は王2/香1/し4(isDamashiKyou成立)
    return engine.policyAction(st, "S", {mc: false, solver: false});   // ルール層のみの決定
  }

  const gAction = decide(G, false);
  assert.strictEqual(gAction.koma, "香", "前提(G・不変): 王2香1初攻め局面でGは騙し香(香)を返す: " + JSON.stringify(gAction));
  assert.ok(/騙し香/.test(gAction.why || ""), "前提: Gのwhyに『騙し香』が含まれる");

  for (const coop of [false, true]) {
    const bAction = decide(G_B, coop);
    assert.notStrictEqual(bAction.koma, "香",
      `M-13: G_B(coop=${coop})は騙し香を返さない(Planner裁定=無条件無効化): ` + JSON.stringify(bAction));
    assert.ok(!/騙し香/.test(bAction.why || ""),
      `M-13: G_B(coop=${coop})のwhyに『騙し香』が含まれない: ` + JSON.stringify(bAction));
  }
  console.log("PASS (c): M-13 — Gは騙し香を返し、G_BはCOOP_SIGNALのon/off両方で騙し香を返さない(無条件無効化)");
})();

console.log("ALL v92c ENGINE TESTS PASSED");
