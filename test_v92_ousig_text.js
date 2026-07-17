const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-7(v92a, PLAN_v92_consistency.md): 王合図の肯定文(auditOuShiSignal の ou 分岐・honest 時の text)の
// 「相方はしを温存して高得点上がりに備えられます」という応答予告を、app.cfg.ouSignal &&
// convTrust(閾値=エンジンのTRUST_READ相当=0.35) 以上の場合のみ表示し、それ以外は事実(王の裏付け
// あり)のみの文に落とす。cfg.ouSignal=false の場合、エンジンは王合図を一切読まない(ouOn=false)ため
// 相方の応答を断言できない。

function ouSigFixture(seat, partner, honestHand) {
  // detectOuSignals: pFirst==="香"&&pFirstAc<=4 かつ、追加するし攻めのac(このケースでは5)が
  // (4,8]の範囲なら honest ou_sig 候補としてヒットする(送り手側の窓と対称の読み手側条件)。
  const hist = [
    {seat, act: "attack", koma: "香"},          // ac=1: pFirst="香", pFirstAc=1
    {seat: partner, act: "attack", koma: "金"}, // ac=2
    {seat: partner, act: "attack", koma: "金"}, // ac=3
    {seat: partner, act: "attack", koma: "金"}, // ac=4
  ];
  const st = {hands: {[seat]: honestHand}, history: hist};
  const mv = {seat, human: true, action: {type: "attack", koma: "し"}};
  const rec = {gameNo: 1, moves: [], result: null, initialHands: null, parent: seat};
  return {rec, st, mv};
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const app = T.app;

  const seat = "S", partner = "N";

  // 前提確認: このfixtureが実際にou_sig(honest)分岐へ入ることを確認
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);
    app.cfg.ouSignal = true;
    app.convTrust = {n: 10, ok: 8};   // convTrustVal=(1+8)/(2+10)=0.75>=0.35
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(sig, "fixtureがou_sig分岐を発火させる前提");
    assert.strictEqual(sig.type, "ou_sig");
    assert.strictEqual(sig.honest, true, "王を保有しているのでhonest");
    console.log("PASS (前提): fixtureはou_sig(honest)分岐に入る");
  }

  // ---- (a) cfg.ouSignal=true かつ convTrust>=0.35 → 応答予告(「相方はしを温存して…」)を含む ----
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);
    app.cfg.ouSignal = true;
    app.convTrust = {n: 10, ok: 8};   // 0.75
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(sig.text.includes("相方はしを温存して"), "ouSignal ON・convTrust十分なら応答予告を含む: " + sig.text);
    console.log("PASS (a): cfg.ouSignal=true かつ convTrust十分なら応答予告文を含む");
  }

  // ---- (b) cfg.ouSignal=false → エンジンは王合図を一切読まないため応答予告を含まない ----
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);
    app.cfg.ouSignal = false;
    app.convTrust = {n: 10, ok: 8};   // 0.75(convTrustは十分でもouSignal自体がOFF)
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(sig.honest, "honestはouSignalに関わらず王の保有で決まる(不変)");
    assert.ok(!sig.text.includes("相方はしを温存して"), "ouSignal OFFなら応答予告文を含まない(M-7): " + sig.text);
    assert.ok(sig.text.includes("正しく送っています"), "事実(王の裏付けあり)の文自体は残る: " + sig.text);
    console.log("PASS (b): cfg.ouSignal=falseなら応答予告文が出ない(M-7)");
  }

  // ---- (c) cfg.ouSignal=true だが convTrust<0.35(信頼度低下) → 応答予告を含まない ----
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);
    app.cfg.ouSignal = true;
    app.convTrust = {n: 20, ok: 0};   // (1+0)/(2+20)=1/22≈0.045<0.35
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(!sig.text.includes("相方はしを温存して"), "convTrust低下時は応答予告文を含まない(M-7): " + sig.text);
    console.log("PASS (c): convTrustが閾値未満なら応答予告文が出ない(M-7)");
  }

  // ---- (d) 回帰: 境界値ちょうど(convTrustVal===0.35)は含む側(>=) ----
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["王", "角", "銀", "飛"]);
    app.cfg.ouSignal = true;
    // (1+ok)/(2+n) = 0.35 となる整数解: n=18, ok=(0.35*20)-1=6 -> (1+6)/(2+18)=7/20=0.35 ちょうど
    app.convTrust = {n: 18, ok: 6};
    const v = T.convTrustVal();
    assert.strictEqual(v, 0.35, "前提: convTrustValがちょうど0.35になるfixture");
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.ok(sig.text.includes("相方はしを温存して"), "閾値ちょうど(0.35)は「以上」に含まれ応答予告文を含む: " + sig.text);
    console.log("PASS (d): convTrustVal===0.35(閾値ちょうど)は応答予告文を含む(以上判定の回帰確認)");
  }

  // ---- (e) 回帰: honest でない分岐(裏付けなし)の文言は本修正で変化しない ----
  //      (このfixtureはrec.moves=[]のためendShiCounts経由のpartnerEndShiが常に0となり、
  //       wasted(空振り)分岐ではなく「空振りにはならずに済みました」分岐が確定的に選ばれる。
  //       この分岐もM-7の対象外(ou分岐のhonest時textのみが対象)であり不変であることを確認する。)
  {
    const {rec, st, mv} = ouSigFixture(seat, partner, ["角", "銀", "飛", "馬"]);   // 王を持たない
    rec.result = {winner: "E", pts: 20};   // team(S)==="NS"なのでEW勝ち=lost
    app.cfg.ouSignal = true;
    app.convTrust = {n: 10, ok: 8};
    const sig = T.auditOuShiSignal(rec, st, mv, 0);
    assert.strictEqual(sig.honest, false, "王を保有しないのでhonest=false(不変)");
    assert.ok(sig.text.includes("王合図の裏付け（王）を欠きますが"), "非honest分岐の文言は本修正の対象外で不変: " + sig.text);
    console.log("PASS (e): honestでない分岐の文言は本修正の影響を受けない(回帰なし)");
  }

  console.log("ALL v92 OUSIG_TEXT TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
