const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// F-1(PLAN_v90_2_threefixes.md): 親(人間)の伏せ描画で.koma.recと.koma.deal-inが同居し、cascadeで
// .deal-inのdealInアニメがrecGlowを上書きしたまま(fill-mode both)恒久化する不具合。
// 修正: dealAnimStart()で_dealAnimUntil+250ms後にdeal-inクラス+inline animationDelayを後片付け。
// スキップハンドラでも即時に同じ後片付けを行う。

function setupParentHumanGame(app, G, seed) {
  app.humanSeat = "S";
  app.tiers = {N: "coop", W: "strong", S: "human", E: "strong"};
  app.rng = G.mulberry32(seed);
  app.cfg.assistHi = true;
  app.cfg.solver = true;
  app.cfg.fxLen = "full";   // deal animation must be enabled (dealMs > 0)
  app.scores = {NS: 0, EW: 0};
  app.matchNo = 1; app.gameNo = 0;
  app.matchRecs = []; app.importedRecs = []; app.career = []; app.coachHistory = [];
  app.parent = "S";   // human is this hand's parent -> phase starts as "bury" with a full 8-koma hand
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

  // (a) 描画直後は rec と deal-in が共存する(修正前からある前提条件・変えていないことの確認)
  setupParentHumanGame(app, G, 1);
  T.startGame();
  assert.strictEqual(app.st.phase, "bury", "parent's first phase should be bury");
  assert.strictEqual(app.st.hands.S.length, 8, "parent should hold all 8 komas before burying");
  let tray = doc.getElementById("hand");
  let recTile = [...tray.children].find(el => el.classList.contains("rec"));
  assert.ok(recTile, "a recommended tile should be present on the very first bury-phase render");
  assert.ok(recTile.classList.contains("deal-in"), "(a) rec and deal-in must still co-occur immediately after the synchronous render");
  assert.ok(recTile.style.animationDelay, "(a) the recommended tile should carry the inline animationDelay from the deal choreography");
  console.log("PASS (a): 描画直後はrecとdeal-inが共存する");

  // (b) タイマー後(_dealAnimUntil+250ms相当)にdeal-inとinline delayが消え、recは残る
  const fx = app.cfg.fxLen;
  // dealMsの実測値がテスト環境依存にならないよう、十分に長く待ってからクリーンアップの発火を確認する。
  await wait(1500);
  tray = doc.getElementById("hand");
  const allKomas = [...tray.children];
  const anyDealIn = allKomas.some(el => el.classList.contains("deal-in"));
  const anyInlineDelay = allKomas.some(el => el.style.animationDelay);
  assert.ok(!anyDealIn, "(b) after the cleanup timer fires, no koma should carry deal-in");
  assert.ok(!anyInlineDelay, "(b) after the cleanup timer fires, no koma should carry an inline animationDelay");
  const recTile2 = allKomas.find(el => el.classList.contains("rec"));
  assert.ok(recTile2, "(b) the recommended tile should still be present (rec class itself is untouched by cleanup)");
  console.log("PASS (b): タイマー後にdeal-inとinline delayが消え、recは残る");

  // (c) スキップ経路(#boardタップ)で即時に同状態になる
  setupParentHumanGame(app, G, 1);
  T.startGame();
  assert.strictEqual(app.st.phase, "bury");
  let trayC = doc.getElementById("hand");
  const beforeSkip = [...trayC.children].some(el => el.classList.contains("deal-in"));
  assert.ok(beforeSkip, "(c) precondition: deal-in should be present before the skip click");
  const board = doc.getElementById("board");
  assert.ok(board, "#board should exist");
  board.dispatchEvent(new window.Event("click", {bubbles: true}));
  await wait(20);
  trayC = doc.getElementById("hand");
  const afterSkip = [...trayC.children];
  assert.ok(!afterSkip.some(el => el.classList.contains("deal-in")), "(c) skip should immediately clear deal-in");
  assert.ok(!afterSkip.some(el => el.style.animationDelay), "(c) skip should immediately clear inline animationDelay");
  const recTileC = afterSkip.find(el => el.classList.contains("rec"));
  assert.ok(recTileC, "(c) recommended tile should still be present after skip");
  console.log("PASS (c): スキップ経路(#boardタップ)で即時にdeal-in/inline delayが消える");

  // (d) 既存C-1の1回性は不変: 2手目以降の再描画でdeal-inが再付与されない(伏せ後の攻め駒選択)
  const buryKoma = app.st.hands.S[0];
  T.onHandTap(buryKoma);
  await wait(20);
  assert.strictEqual(app.st.phase, "attack", "after burying, actor should move to attack phase");
  const trayD = doc.getElementById("hand");
  const komasD = [...trayD.children];
  assert.ok(!komasD.some(el => el.classList.contains("deal-in")), "(d) attack-phase render must not re-add deal-in (C-1 one-shot semantics unchanged)");
  const recTileD = komasD.find(el => el.classList.contains("rec"));
  assert.ok(recTileD, "(d) recommended tile should still be present on the attack-phase render");
  console.log("PASS (d): 2手目(攻め)の再描画でdeal-inが再付与されない(既存C-1の1回性は不変)");

  // (e) reduced-motion / fxLen=min では deal-in 自体が付かない(dealAnimAllowed側)ことを回帰確認
  setupParentHumanGame(app, G, 1);
  app.cfg.fxLen = "min";
  T.startGame();
  const trayE = doc.getElementById("hand");
  const anyDealInMin = [...trayE.children].some(el => el.classList.contains("deal-in"));
  assert.ok(!anyDealInMin, "(e) fxLen=min should mean deal-in is never applied in the first place");
  console.log("PASS (e): fxLen=min ではdeal-inが最初から付与されない(回帰なし)");

  console.log("ALL F-1 TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
