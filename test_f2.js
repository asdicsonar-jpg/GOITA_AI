const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// F-2(PLAN_v90_2_threefixes.md): 席名称の変更(自分/相方/下家/上家)。
// SEAT_JA(南北東西)は内部表現・保存(kifu/recToKifu/career)専用として温存し、
// 表示専用にseatDisp()/teamDisp()を新設。観戦(humanSeatなし)は方位名にフォールバック。

function setupParentHumanGame(app, G, seed) {
  app.humanSeat = "S";
  app.tiers = {N: "coop", W: "strong", S: "human", E: "strong"};
  app.rng = G.mulberry32(seed);
  app.cfg.assistHi = true;
  app.cfg.solver = true;
  app.cfg.fxLen = "min";   // アニメ待ちを避けて素早く状態遷移を確認する
  app.scores = {NS: 0, EW: 0};
  app.matchNo = 1; app.gameNo = 0;
  app.matchRecs = []; app.importedRecs = []; app.career = []; app.coachHistory = [];
  app.parent = "S";
  app.rec = null; app.tutorial = null; app.research = null; app.stopped = false; app.review = null;
}

function baseRec(seat, moves, result) {
  return {
    gameNo: 1, matchNo: 1, parent: seat,
    initialHands: {N: [], W: [], S: [], E: []},
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: result || null,
  };
}

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;
  const doc = window.document;

  // (1) 対局中の名札: humanSeat=S を基準に、自分/相方/下家/上家 が正しく割り当てられる
  //     (G.SEATS=[N,W,S,E], nextSeat(S)=E なので E=下家、残るWが上家)
  setupParentHumanGame(app, G, 1);
  T.startGame();
  const nmOf = seat => doc.getElementById("card-" + seat.toLowerCase()).querySelector(".nm").textContent;
  assert.strictEqual(nmOf("S"), "自分", "S(自分)の名札");
  assert.strictEqual(nmOf("N"), "相方", "N(相方)の名札");
  assert.strictEqual(nmOf("E"), "下家", "E(下家)の名札 — 南の次は東");
  assert.strictEqual(nmOf("W"), "上家", "W(上家)の名札");
  const ariaS = doc.getElementById("card-s").getAttribute("aria-label");
  assert.ok(ariaS && ariaS.startsWith("自分"), "aria-labelもseatDisp基準: " + ariaS);
  console.log("PASS (1): 対局中の名札(自分/相方/下家/上家)が正しく表示される");

  // (2) 実況・ログ: 伏せ操作でapplyAndLog()が呼ばれ、log()とannounce()の双方がseatDisp表記になる
  assert.strictEqual(app.st.phase, "bury");
  const buryKoma = app.st.hands.S[0];
  T.onHandTap(buryKoma);
  await wait(50);
  const firstLog = doc.getElementById("log").firstElementChild;
  assert.ok(firstLog, "ログにエントリがある");
  assert.ok(firstLog.textContent.includes("自分"), "ログはseatDisp表記(自分): " + firstLog.textContent);
  assert.ok(!/^[北西東南]/.test(firstLog.textContent.trim()), "ログ先頭が方位名の生表記でない: " + firstLog.textContent);
  await wait(50);   // announce()はrequestAnimationFrame経由
  const srLive = doc.getElementById("sr-live");
  if (srLive && srLive.textContent) {
    assert.ok(!/^[北西東南][:：]/.test(srLive.textContent.trim()), "SR実況も方位名の生表記でない: " + srLive.textContent);
  }
  console.log("PASS (2): 実況・ログがseatDisp表記になっている");

  // (3) 振り返りリスト: renderReviewList()の各手の席表示がseatDisp表記
  {
    const seat = "S";
    const moves = [
      {seat: "S", human: true, action: {type: "bury", koma: "馬"}},
      {seat: "N", human: false, action: {type: "bury", koma: "馬"}, why: "定石"},
      {seat: "E", human: false, action: {type: "attack", koma: "香"}, why: "定石"},
    ];
    const rec = baseRec(seat, moves, {winner: "S"});
    rec.initialHands = {N: ["馬", "角"], W: ["馬", "角"], S: ["馬", "角"], E: ["香", "角"]};
    app.humanSeat = "S";
    T.openReviewOn(rec, rec.moves.length - 1);
    const items = [...doc.getElementById("rv-list").children];
    assert.strictEqual(items.length, 3, "振り返りリストの件数");
    assert.ok(items[0].querySelector(".mv").textContent.includes("自分"), "1手目(S)=自分: " + items[0].textContent);
    assert.ok(items[1].querySelector(".mv").textContent.includes("相方"), "2手目(N)=相方: " + items[1].textContent);
    assert.ok(items[2].querySelector(".mv").textContent.includes("下家"), "3手目(E)=下家: " + items[2].textContent);
    console.log("PASS (3): 振り返りリストの席表示がseatDisp表記");

    // (6) rv-partner時の不変: 「相方の視点」トグルをON/OFFしても席呼称自体(自分/相方/下家)は変わらない
    const rvPartner = doc.getElementById("rv-partner");
    assert.ok(rvPartner, "rv-partnerチェックボックスが存在する");
    rvPartner.checked = true;
    T.renderReviewList();
    const items2 = [...doc.getElementById("rv-list").children];
    assert.ok(items2[0].querySelector(".mv").textContent.includes("自分"), "rv-partner ON後も1手目=自分のまま: " + items2[0].textContent);
    assert.ok(items2[1].querySelector(".mv").textContent.includes("相方"), "rv-partner ON後も2手目=相方のまま: " + items2[1].textContent);
    assert.ok(items2[2].querySelector(".mv").textContent.includes("下家"), "rv-partner ON後も3手目=下家のまま: " + items2[2].textContent);
    rvPartner.checked = false;
    T.renderReviewList();
    console.log("PASS (6): 「相方の視点」トグルは席呼称(seatDisp)に影響しない(不変)");
    app.review = null;
  }

  // (4) 五し相談: askHumanGoshi()のモーダル文言がseatDisp表記(下家/上家/相方等)になる
  {
    app.humanSeat = "S";
    const hands = {
      N: ["し", "し", "馬", "角", "銀", "飛", "香", "王"],
      W: ["し", "し", "し", "し", "し", "馬", "角", "銀"],   // Wが5し保持者
      S: ["馬", "角", "銀", "飛", "香", "王", "し", "し"],
      E: ["馬", "角", "銀", "飛", "香", "王", "し", "し"],
    };
    const chk = {needHuman: [{holder: "W", enemyAlso: false}], aiVotes: []};
    T.askHumanGoshi(hands, chk, () => {});
    const modalText = doc.getElementById("modal-body").textContent;
    assert.ok(modalText.includes("上家"), "五し相談モーダルはWを上家と表記: " + modalText);
    assert.ok(!modalText.includes("西が"), "モーダルに方位の生表記(西が)が残っていない: " + modalText);
    T.closeModal();
    console.log("PASS (4): 五し相談モーダルの席名がseatDisp表記(上家)");
  }

  // (5) 観戦時の方位フォールバック: humanSeatがnullのときはSEAT_JA(方位名)にフォールバックする
  {
    const savedSeat = app.humanSeat;
    app.humanSeat = null;
    assert.strictEqual(T.seatDisp("N"), "北", "観戦時のN表示は方位名(北)");
    assert.strictEqual(T.seatDisp("W"), "西", "観戦時のW表示は方位名(西)");
    assert.strictEqual(T.seatDisp("S"), "南", "観戦時のS表示は方位名(南)");
    assert.strictEqual(T.seatDisp("E"), "東", "観戦時のE表示は方位名(東)");
    assert.strictEqual(T.teamDisp("NS"), "南北", "観戦時のNSチーム表示は南北(「組」なし)");
    assert.strictEqual(T.teamDisp("EW"), "東西", "観戦時のEWチーム表示は東西(「組」なし)");
    app.humanSeat = savedSeat;
    console.log("PASS (5): 観戦時(humanSeatなし)は方位名にフォールバックする");
  }

  // teamDisp: humanSeat設定時は「組」付きの相対呼称になる(観戦時と対比)
  {
    app.humanSeat = "S";   // G.team("S") === "NS"
    assert.strictEqual(T.teamDisp("NS"), "あなた組", "自分の組はあなた組");
    assert.strictEqual(T.teamDisp("EW"), "相手組", "相手の組は相手組");
    console.log("PASS (teamDisp): 対局中はあなた組/相手組の相対呼称になる");
  }

  // (7) kifu互換性: app.kifuLines(棋譜転記行)は新称を含まず、従来どおりSEAT_JA(方位名)のまま
  {
    setupParentHumanGame(app, G, 1);
    T.startGame();
    assert.strictEqual(app.st.phase, "bury");
    T.onHandTap(app.st.hands.S[0]);
    await wait(50);
    assert.ok(app.kifuLines && app.kifuLines.length > 0, "kifuLinesに記録がある");
    const joined = app.kifuLines.join("\n");
    assert.ok(!joined.includes("自分") && !joined.includes("相方") && !joined.includes("下家") && !joined.includes("上家"),
      "棋譜転記(kifuLines)に新称(自分/相方/下家/上家)が混入していない: " + JSON.stringify(app.kifuLines));
    console.log("PASS (7): 棋譜転記(kifuLines)は新称を含まず、SEAT_JA(方位名)のまま(後方互換)");
  }

  console.log("ALL F-2 TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
