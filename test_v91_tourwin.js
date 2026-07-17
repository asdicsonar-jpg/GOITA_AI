const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md A-5: 出場前チェックリスト項目2の判定・記録の是正。
// (1) 判定はtw.wins>0なのにラベルは「勝ち越せる」— 10敗1勝でも✓が付く。subは空でwins/lossesが見えない。
//     修正: 判定をtw.wins>tw.losses(勝ち越し)へ変更し、subに「n勝m敗」の事実を表示する。
// (2) showMatchEndの記録フックに再入ガードが無い。終局後の「結果を見る」はendPractice/Escで閉じた後も
//     再度押せるため、同一マッチが複数回記録されうる。
//     修正: app._tourWinRecordedフラグをshowMatchEndの記録直前で立て、newMatch()/readSetup起点の
//     新マッチ開始・resumeSavedMatchでリセットする。

function extractRow(html, label) {
  const idx = html.indexOf(label);
  assert.ok(idx >= 0, "label not found: " + label);
  const markStart = html.lastIndexOf('">', idx) + 2;
  const mark = html.slice(markStart, markStart + 1);
  const subMatch = html.slice(idx).match(/<span class="tn">([^<]*)<\/span>/);
  return {mark, sub: subMatch ? subMatch[1] : null};
}

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;

  // ==== Part 1: item2判定(wins>lossesの勝ち越し判定)とsub(n勝m敗)表示 ====
  window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 1, losses: 3}));
  const html1 = T.readinessChecklistHtml();
  const row1 = extractRow(html1, "最強AI相手に150点先取で勝ち越せる");
  // 【A-5】1勝3敗(負け越し)は✓ではなく─であるべき(旧実装はwins>0でtrueになり誤って✓が付いていた)
  assert.strictEqual(row1.mark, "─", "【A-5】1勝3敗は勝ち越していないので─(旧実装のwins>0バグではないこと): mark=" + row1.mark);
  assert.strictEqual(row1.sub, "1勝3敗", "【A-5】subに「1勝3敗」の事実表示がある: sub=" + row1.sub);

  window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 3, losses: 1}));
  const html2 = T.readinessChecklistHtml();
  const row2 = extractRow(html2, "最強AI相手に150点先取で勝ち越せる");
  assert.strictEqual(row2.mark, "✓", "【A-5】3勝1敗(勝ち越し)は✓: mark=" + row2.mark);
  assert.strictEqual(row2.sub, "3勝1敗", "【A-5】subに「3勝1敗」の事実表示がある: sub=" + row2.sub);

  console.log("PASS (A-5-1): 項目2はwins>lossesの勝ち越し判定になり、subにn勝m敗が表示される");

  // ==== Part 2: showMatchEndの一回性ガード ====
  window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 0, losses: 0}));
  app.humanSeat = "S";
  app.tiers = {N: "strong", W: "strong", S: "human", E: "strong"};
  app.cfg.target = 150;
  app.scores = {NS: 150, EW: 100};   // S(=NSチーム)の勝ち
  app.gameNo = 3;
  app.coachHistory = [];
  app.matchRecs = []; app.importedRecs = [];
  app._tourWinRecorded = false;

  T.showMatchEnd();
  assert.strictEqual(T.tourWinLoad().wins, 1, "1回目のshowMatchEndでwinsが1件記録される");

  // 「結果を見る」の再押下(endPractice後やEscで閉じた後の再表示)を模す: 同一マッチのままもう一度呼ぶ
  T.showMatchEnd();
  assert.strictEqual(T.tourWinLoad().wins, 1,
    "【A-5】同一マッチでshowMatchEndを2回呼んでもwinsは1のまま(二重記録されない)");
  assert.strictEqual(T.tourWinLoad().losses, 0, "【A-5】lossesも二重記録されない");

  console.log("PASS (A-5-2): showMatchEndの一回性ガードにより同一マッチの二重記録が起きない");

  // ---- newMatch()でリセットされ、次のマッチでは再び記録できること ----
  app.rng = G.mulberry32(1);
  T.newMatch();
  assert.strictEqual(app._tourWinRecorded, false, "【A-5】newMatch()後はapp._tourWinRecordedがリセットされる");

  app.humanSeat = "S";
  app.tiers = {N: "strong", W: "strong", S: "human", E: "strong"};
  app.cfg.target = 150;
  app.scores = {NS: 100, EW: 150};   // 今度はS(=NSチーム)の負け
  T.showMatchEnd();
  assert.strictEqual(T.tourWinLoad().losses, 1, "【A-5】newMatch()でリセットされた後、次のマッチ結果が記録される(losses=1)");
  assert.strictEqual(T.tourWinLoad().wins, 1, "winsは前マッチの1のまま");

  console.log("PASS (A-5-3): newMatch()でapp._tourWinRecordedがリセットされ、次のマッチが正しく記録される");

  // ---- resumeSavedMatch()でもリセットされること ----
  app._tourWinRecorded = true;   // 直前マッチの記録済みフラグが残っている状態を模す
  app.rng = G.mulberry32(2);
  const saved = {
    tiers: {N: "strong", W: "strong", S: "human", E: "strong"},
    humanSeat: "S", scores: {NS: 0, EW: 0}, parent: "S",
    gameNo: 0, matchNo: 9, phase: "between",
  };
  T.resumeSavedMatch(saved);
  assert.strictEqual(app._tourWinRecorded, false, "【A-5】resumeSavedMatch()後もapp._tourWinRecordedがリセットされる");

  console.log("PASS (A-5-4): resumeSavedMatch()でもapp._tourWinRecordedがリセットされる");

  console.log("ALL A-5(tourwin) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
