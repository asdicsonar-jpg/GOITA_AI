const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// REVIEW_REPORT_v90.2.md Must-fix 1・2 の修正確認。
// Must-fix 1: showYakuSplashのteamJaが旧表記(南北/東西)のまま残っていた不具合。
// Must-fix 2: F-1の後片付けタイマーが演出プリセット「短め」で配牌アニメを途中切断していた不具合。

function setupParentHumanGame(app, G, seed, fxLen) {
  app.humanSeat = "S";
  app.tiers = {N: "coop", W: "strong", S: "human", E: "strong"};
  app.rng = G.mulberry32(seed);
  app.cfg.assistHi = true;
  app.cfg.solver = true;
  app.cfg.fxLen = fxLen;
  app.scores = {NS: 0, EW: 0};
  app.matchNo = 1; app.gameNo = 0;
  app.matchRecs = []; app.importedRecs = []; app.career = []; app.coachHistory = [];
  app.parent = "S";
  app.rec = null; app.tutorial = null; app.research = null; app.stopped = false; app.review = null;
}

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;
  const doc = window.document;

  // ---- Must-fix 2: 後片付けタイマーの発火時刻 >= 実際の駒アニメ完了時刻 (full/short/minの3プリセット) ----
  const DUR_MOVE_MS = 300;
  const theoreticalCompletion = (T.dealSeatOrder().length - 1) * 120 + 7 * 30 + DUR_MOVE_MS;
  assert.strictEqual(theoreticalCompletion, 870, "理論上の最終駒アニメ完了時刻は870msのはず");

  for (const preset of ["full", "short", "min"]) {
    setupParentHumanGame(app, G, 1, preset);
    const dealMs = T.FX[preset].dealMs;
    if (dealMs === 0) {
      T.startGame();
      assert.strictEqual(app._dealAnimPending, false, `min: dealAnimPendingは立たない`);
      console.log(`PASS (Must-fix2/${preset}): dealMs=0のため後片付けタイマー自体が不要(演出無効)`);
      continue;
    }
    T.startGame();
    await wait(theoreticalCompletion - 50);
    let tray = doc.getElementById("hand");
    let stillAnimating = [...tray.children].some(el => el.classList.contains("deal-in"));
    assert.ok(stillAnimating, `${preset}: 完了直前(${theoreticalCompletion - 50}ms時点)ではまだdeal-inが残っているべき(途中で剥がれていないか)`);
    await wait(250 + 100);
    tray = doc.getElementById("hand");
    const anyDealIn = [...tray.children].some(el => el.classList.contains("deal-in"));
    assert.ok(!anyDealIn, `${preset}: 十分待てば後片付けは完了しdeal-inは残らない`);
    console.log(`PASS (Must-fix2/${preset}): 発火時刻がアニメ完了(${theoreticalCompletion}ms)を待ってから後片付けする(途中切断なし)`);
  }

  // ---- Must-fix 1: showYakuSplashのチーム表示がteamDispに統一され、対局中/観戦時とも「組」の二重付与がない ----
  {
    // 対局中(humanSeat=S, sp.team=NS=自分の組)
    setupParentHumanGame(app, G, 1, "min");
    T.startGame();
    const sp = {seat: "S", team: "NS", reason: "大役手役", pts: 40, hands: {S: ["王", "王"], N: ["王", "王"]}};
    T.showYakuSplash(sp, {});
    const txt1 = doc.getElementById("ys-seat").textContent;
    assert.strictEqual(txt1, "自分・あなた組", "対局中: 「自分・あなた組」(teamDispが既に「組」を含み、二重付与なし): " + txt1);
    assert.ok(!txt1.includes("南北"), "対局中: 旧表記「南北」が残っていない: " + txt1);
    console.log("PASS (Must-fix1/対局中): showYakuSplashが「自分・あなた組」と表示し、「組組」の二重付与も旧表記残存もない");

    // 観戦時(humanSeat=null)は方位名+「組」が必要(teamDispが「組」を含まないため手動付与)
    app.humanSeat = null;
    const sp2 = {seat: "N", team: "NS", reason: "大役手役", pts: 40, hands: {N: ["王", "王"], S: ["王", "王"]}};
    T.showYakuSplash(sp2, {});
    const txt2 = doc.getElementById("ys-seat").textContent;
    assert.strictEqual(txt2, "北・南北組", "観戦時: 「北・南北組」(teamDispは「組」を含まないため手動付与): " + txt2);
    console.log("PASS (Must-fix1/観戦時): 観戦時は方位名+南北組の表記になり、「組」の付与漏れがない");
  }

  console.log("ALL REVIEW-FIX TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
