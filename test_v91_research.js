const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md A-4: 研究モードの局がcareer・卒業試行・過去の自分ピンを汚染し、試行を
// 即中断させる不具合。研究モードはapp.humanSeat="S"を設定するが、onGameOverの研究分岐
// (if (app.research && app.research.active) { researchAfterDeal(res); return; }) は
// humanSeatブロック(computeCoach→misses→sc→pastMaybeAdd→matchRecs.push→career.push→
// gradOnGameFinished→saveCareerToStorage)の【後】にある。scaffoldStampAllowed()は研究局を
// 除外してsc=nullにするため、試行中に研究局を1局流すとgradOnGameFinishedが「!sc」で試行を
// 即中断させ、研究局の手がcareer・弱点プロフィール・「過去の自分」ピンにも混入する。
// 修正: humanSeatブロックのガードを`if (app.humanSeat && !(app.research && app.research.active))`
// に変更する(研究分岐の位置は動かさない)。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;

  // 進行中の卒業試行を1件用意する(研究局1局を挟んでもこのtrialが無事であることを確認する)
  const sf = T.SCAFFOLDS.find(s => s.key === "hints");
  T.gradSave({v: 1, trial: {key: sf.key, phase: "trial", games: [], threshold: 0.7},
              cooldown: {}, graduated: {}});

  // 前提: career/matchRecs/coachHistoryはまだ空
  app.career = []; app.matchRecs = []; app.coachHistory = [];
  assert.strictEqual(window.localStorage.getItem(T.PAST_STORAGE_KEY), null, "前提: goita_past_v1は未設定");
  const careerStorageBefore = window.localStorage.getItem(T.CAREER_STORAGE_KEY);

  // 研究モード(rs-start相当)を模す最小セットアップ: humanSeat="S"・app.research.active=true
  app.humanSeat = "S";
  app.tiers = {N: "strong", W: "strong", S: "strong", E: "strong"};
  app.research = {
    active: true, blockIdx: 0, dealInBlock: 0, condition: "A",
    blockOrder: ["A", "B"], dealsPerBlock: 1, seeds: [1], parents: ["S"],
    seatTested: G.partnerOf("S"), curDeal: {seed: 1, parent: "S", moves: [], result: null},
    log: {participant_id: "test", session: 1, blocks: ["A", "B"], deals: [], predictions: [], surveys: [],
          final: null, meta: {participant_skill_selfrated: 3, knows_joseki: true, started: Date.now(), elapsed: null}},
  };

  // 研究局を1局分、実際に配牌・1手適用してから終局させる(gradOnGameFinishedが呼ばれれば
  // sc=nullで即座に試行を中断してしまう不具合を再現する経路)
  app.rng = G.mulberry32(1);
  app.parent = "S";
  app._scAtStart = {...app.cfg};
  const hands = G.dealOnce(app.rng);
  app.st = G.newGameState(hands, "S");
  app.rec = {gameNo: 1, parent: "S",
             initialHands: {N: hands.N.slice(), W: hands.W.slice(), S: hands.S.slice(), E: hands.E.slice()},
             scoresBefore: {NS: 0, EW: 0}, moves: []};
  assert.strictEqual(app.st.actor, "S", "前提: 配牌後の手番はS");
  const koma = app.st.hands.S[0];
  T.applyAndLog({type: "bury", koma});
  assert.strictEqual(app.rec.moves.length, 1, "前提: 研究局で1手記録されている(human=trueで記録される)");

  const res = {winner: "S", pts: 10, koma: "し", dbl: false, recvFinish: false, draw: false};
  T.onGameOver(res);

  // 【A-4】career/matchRecs/coachHistoryが研究局によって汚染されていないこと
  assert.strictEqual(app.career.length, 0, "【A-4】研究局はapp.careerへpushされない");
  assert.strictEqual(app.matchRecs.length, 0, "【A-4】研究局はapp.matchRecsへpushされない");
  assert.strictEqual(app.coachHistory.length, 0, "【A-4】研究局はapp.coachHistoryへpushされない");

  // 【A-4】saveCareerToStorage()が(研究局によって)新たに呼ばれていない = ストレージ内容が不変
  const careerStorageAfter = window.localStorage.getItem(T.CAREER_STORAGE_KEY);
  assert.strictEqual(careerStorageAfter, careerStorageBefore, "【A-4】goita_careerストレージが研究局で変化しない");

  // 【A-4】過去の自分ピン(pastMaybeAdd)が研究局から生成されていないこと
  assert.strictEqual(window.localStorage.getItem(T.PAST_STORAGE_KEY), null,
    "【A-4】研究局はgoita_past_v1へピンを追加しない");

  // 【A-4】進行中の卒業試行(trial)が研究局によって中断・汚染されていないこと
  const gAfter = T.gradLoad();
  assert.ok(gAfter.trial, "【A-4】研究局を挟んでも卒業試行(trial)は中断されない");
  assert.strictEqual(gAfter.trial.phase, "trial", "【A-4】trial.phaseは引き続き'trial'");
  assert.strictEqual(gAfter.trial.games.length, 0, "【A-4】研究局はtrial.gamesにも計上されない");

  console.log("PASS (A-4): 研究モードの局はcareer/matchRecs/coachHistory/goita_past_v1/卒業試行のいずれも汚染しない");

  // ---- 研究モードのレポート出力(researchExport相当)がcareer系に依存していないことのdocumentation確認 ----
  // researchExport()はR.log(participant_id/session/blocks/deals/predictions/surveys/final)のみを
  // JSONへ出力し、app.career/app.coachHistory/app.matchRecsを一切参照しない(実装時grep済み・
  // IMPLEMENTATION_REPORT_v91a.mdに記載)。onGameOverの研究分岐(researchAfterDeal)は本fixで位置を
  // 動かしていないため、通常どおり1局分がR.log.dealsへ記録されていることのみ確認する(独立ログ経路の生存確認)。
  assert.strictEqual(app.research.log.deals.length, 1, "参考: researchAfterDeal自体は不変(1局分がR.log.dealsに記録される)");

  console.log("ALL A-4(research) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
