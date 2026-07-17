const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-5(v92a, PLAN_v92_consistency.md): setOppProfileBoth を新設(setTblTrustBoth と同型)し、
// applyOppProfile から G/G_B 両方へ反映する。従来 G_B(coop=対人協調エンジン)には一切ミラーされて
// いなかったため、coop 相方AIが人間プロフィール無しの既定値のまま打っていた。
// エンジン(G/G_B)自体は無改変で、公開API(setOppProfile)を呼ぶだけであることを確認する。

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const app = T.app;
  const G = T.G;
  const G_B = T.G_B;

  app.humanSeat = "S";

  // ---- (a) applyOppProfile 後、G側だけでなくG_B側にも相手モデルが設定される(公開APIで観測) ----
  {
    app.oppCounts = {pe: {n: 5, k: 1}, pp: {n: 5, k: 1}, bl: {n: 8, k: 5}, blV: 1};   // bluff率0.625>0.5
    T.applyOppProfile();
    const rates = G.oppRatesFromCounts(app.oppCounts);
    // G/G_B とも内部の OPP_PROFILE は非公開だが、inferPartnerHoldings の pairN 分岐(bluff>0.5で
    // pairN=1)を通じて挙動に現れる。ここでは同じ入力(rates)をG_B.setOppProfileで独立に設定し直しても
    // 例外が出ない(=G_Bにも同じ公開APIが存在し受理される)ことと、setOppProfileBothがG_B.setOppProfile
    // を実際に呼んでいることをスパイで確認する。
    let calledSeat = null, calledProf = null;
    const orig = G_B.setOppProfile;
    G_B.setOppProfile = function (seat, prof) { calledSeat = seat; calledProf = prof; return orig.call(G_B, seat, prof); };
    try {
      T.applyOppProfile();
      assert.strictEqual(calledSeat, "S", "applyOppProfileがG_B.setOppProfileを人間席で呼ぶ");
      assert.ok(calledProf && typeof calledProf.bluff === "number", "G_B.setOppProfileへ渡されるprofにbluffが含まれる: " + JSON.stringify(calledProf));
      assert.strictEqual(calledProf.bluff, rates.bluff, "G.oppRatesFromCountsが計算したbluff率がそのままG_Bへ渡る(rates.bluff=" + rates.bluff + "): " + JSON.stringify(calledProf));
    } finally {
      G_B.setOppProfile = orig;
    }
    console.log("PASS (a): applyOppProfile経由でG_B.setOppProfileが呼ばれ、G/G_B両方へ相手モデルが反映される(M-5)");
  }

  // ---- (b) setOppProfileBoth単体: G/G_B双方のsetOppProfileを呼ぶ(setTblTrustBothと同型) ----
  {
    let gCalled = false, gbCalled = false;
    const origG = G.setOppProfile, origGB = G_B.setOppProfile;
    G.setOppProfile = function (seat, prof) { gCalled = true; return origG.call(G, seat, prof); };
    G_B.setOppProfile = function (seat, prof) { gbCalled = true; return origGB.call(G_B, seat, prof); };
    try {
      T.setOppProfileBoth("N", {bluff: 0.2, hideE: 0.3, hideP: 0.3});
      assert.ok(gCalled, "setOppProfileBothはG.setOppProfileを呼ぶ");
      assert.ok(gbCalled, "setOppProfileBothはG_B.setOppProfileも呼ぶ(setTblTrustBothと同型)");
    } finally {
      G.setOppProfile = origG; G_B.setOppProfile = origGB;
    }
    console.log("PASS (b): setOppProfileBothはG.setOppProfileとG_B.setOppProfileの両方を呼ぶ");
  }

  // ---- (c) null プロファイル(未学習時)でも例外なくG/G_B双方へ反映される(applyOppProfileの既存経路) ----
  {
    app.oppCounts = null;
    assert.doesNotThrow(() => T.applyOppProfile(), "app.oppCounts=nullでも例外にならない");
    console.log("PASS (c): oppCounts未設定時もapplyOppProfileが例外なく動作する(回帰なし)");
  }

  console.log("ALL v92 OPPBOTH TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
