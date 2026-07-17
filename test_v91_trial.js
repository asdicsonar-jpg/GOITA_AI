const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md A-1: setupフォーム⇔cfgの一方向同期により卒業の「試し」が即死する不具合。
// gradTrialStart は app.cfg[key]=false のみでフォームを更新しない → readSetup がフォームの旧値(true)を
// 読み戻して cfg を巻き戻す → startGame の _scAtStart スナップショットに巻き戻り後の値が刻まれる →
// 1局終了時 gradOnGameFinished が「手動再ON」と誤検知して試行を中断する。
// 修正: gradTrialStart/gradTrialRevert/gradTrialContinue の末尾で syncSetupFormFromCfg() を呼ぶ。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;
  const doc = window.document;

  const sf = T.SCAFFOLDS.find(s => s.key === "hints");
  assert.ok(sf, "SCAFFOLDS に hints が存在すること(前提)");

  // 前提: 初期状態でチェックボックスも cfg も true(既定)
  assert.strictEqual(app.cfg.hints, true, "前提: cfg.hints は既定でtrue");
  assert.strictEqual(doc.getElementById("cfg-hints").checked, true, "前提: #cfg-hints は既定でchecked");

  // 「試す」: cfg[key]=false に落として3局計測を開始する
  T.gradTrialStart(sf);
  assert.strictEqual(app.cfg.hints, false, "gradTrialStart直後: cfg.hints は false");
  const gAfterStart = T.gradLoad();
  assert.strictEqual(gAfterStart.trial && gAfterStart.trial.phase, "trial", "gradTrialStart直後: trial.phaseは'trial'");

  // 「対局をはじめる」: readSetup → startGame (setup.jsのenterGame相当を分解して呼ぶ)
  app.rng = G.mulberry32(1);
  app.parent = "S";
  app.stopped = false; app.matchOver = false;
  app.gameNo = 0; app.matchNo = 1; app.coachHistory = []; app.career = []; app.matchRecs = []; app.importedRecs = [];
  T.readSetup(false);
  assert.strictEqual(app.humanSeat, "S", "readSetup後: humanSeatはS(人間参加)");

  // 本不具合の核心アサーション: readSetup後もcfg.hintsがfalseのままであること
  // (フォーム同期が無いと、#cfg-hintsのchecked=trueがそのままreadSetupで読み戻され、ここでtrueに戻ってしまう)
  assert.strictEqual(app.cfg.hints, false,
    "【A-1】readSetup後もcfg.hintsはfalseのまま(フォームがgradTrialStartに追随していれば)");

  T.startGame();
  assert.strictEqual(app._scAtStart.hints, false, "【A-1】startGameのスナップショットにもfalseが刻まれる");

  // 1局分の人間の手を1手作り、onGameOverでgradOnGameFinishedが自然に呼ばれる経路を再現する
  assert.strictEqual(app.st.actor, "S", "前提: 配牌後の手番はS(親)");
  const koma = app.st.hands.S[0];
  T.applyAndLog({type: "bury", koma});
  assert.strictEqual(app.rec.moves.length, 1, "前提: 人間の手が1手記録されている");
  assert.strictEqual(app.rec.moves[0].human, true, "前提: 記録された手はhuman=true");

  const res = {winner: "S", pts: 10, koma: "し", dbl: false, recvFinish: false, draw: false};
  T.onGameOver(res);

  const gAfterGame = T.gradLoad();
  assert.ok(gAfterGame.trial, "【A-1】1局終了後もtrialがnullに中断されていない(手動再ONと誤検知しない)");
  assert.strictEqual(gAfterGame.trial.phase, "trial", "【A-1】trial.phaseは引き続き'trial'");
  assert.strictEqual(gAfterGame.trial.games.length, 1, "【A-1】games配列に1局分が追加されている");

  console.log("ALL A-1(trial) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
