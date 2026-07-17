const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md v91c C-1: 大会仕様の通し稽古。
// - 出場前チェックリストに「大会仕様で一局とおす」ボタンを新設。
// - 押すと確認モーダル(「150点先取・最強AI・全補助なしの大会仕様に設定を変えて対局を始めます」+
//   開始/やめるの2択)。
// - 開始で既存applyLadderPreset("tournament")をフォームへ適用→closeModal→enterGame(false)。
// - 設定は恒久的に大会仕様へ変わる(退避・復元しない。文言で明示)。
// - チェックリスト3項目の下に、未達項目に応じた次の一歩の事実1行(評価語・圧力表現・禁止語彙なし)。
//
// 「修正前fail」の代替確認: build/v92b/src/index.html(v91b/v91c着手前の承認版)には
// rc-tour-start/rts-go/rts-cancelのいずれのidも存在せず、readinessChecklistHtmlに
// 「大会仕様の通し稽古で試せます」の文言も無いことをgrepで確認済み(0件。IMPLEMENTATION_REPORT_v91bc.md記載)。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  // ================================================================
  // (0) 事前の機械証明: applyLadderPreset("tournament")+readSetupがEW=strong・target150・
  //     補助全OFF・coach offを確実にapp.cfg/app.tiersへ反映する(フォーム経由)
  // ================================================================
  {
    // 前もって「はじめて」相当(補助全ON寄り)に戻しておき、tournamentプリセット適用で
    // 確実に上書きされることを確認する
    doc.getElementById("cfg-hints").checked = true;
    doc.getElementById("cfg-reading").checked = true;
    doc.getElementById("cfg-advice").checked = true;
    doc.getElementById("cfg-cand").checked = true;
    doc.getElementById("cfg-sighonest").checked = true;
    doc.getElementById("cfg-counts").checked = true;
    doc.getElementById("cfg-assistHi").checked = true;
    doc.getElementById("cfg-missGuard").checked = true;
    doc.getElementById("cfg-explain").checked = true;
    doc.getElementById("cfg-tempo").checked = true;
    doc.getElementById("cfg-riverseq").checked = true;
    doc.getElementById("cfg-livebar").checked = true;
    doc.getElementById("cfg-target").value = "500";
    doc.getElementById("cfg-EW").value = "naive";
    doc.getElementById("cfg-N").value = "naive";

    T.applyLadderPreset("tournament");

    assert.strictEqual(doc.getElementById("cfg-EW").value, "strong", "【C-1】プリセットでEW=strongがフォームへ反映");
    assert.strictEqual(doc.getElementById("cfg-N").value, "coop", "【C-1】プリセットでN=coopがフォームへ反映");
    assert.strictEqual(doc.getElementById("cfg-target").value, "150", "【C-1】プリセットでtarget=150がフォームへ反映");
    for (const f of ["hints", "reading", "advice", "cand", "sighonest", "counts", "assistHi", "missGuard"]) {
      assert.strictEqual(doc.getElementById("cfg-" + f).checked, false, "【C-1】coach=offにより補助" + f + "がフォームでOFF");
    }
    assert.strictEqual(doc.getElementById("cfg-explain").checked, false, "【C-1】explainがOFF");
    assert.strictEqual(doc.getElementById("cfg-tempo").checked, false, "【C-1】tempoがOFF");
    assert.strictEqual(doc.getElementById("cfg-riverseq").checked, false, "【C-1】riverseqがOFF");
    assert.strictEqual(doc.getElementById("cfg-livebar").checked, false, "【C-1】livebarがOFF");

    // readSetupでapp.cfg/app.tiersへ確実に反映されることを機械証明する
    T.readSetup(false);
    assert.strictEqual(app.tiers.W, "strong", "【C-1】readSetup後、app.tiers.W=strong");
    assert.strictEqual(app.tiers.E, "strong", "【C-1】readSetup後、app.tiers.E=strong");
    assert.strictEqual(app.tiers.N, "coop", "【C-1】readSetup後、app.tiers.N=coop");
    assert.strictEqual(app.cfg.target, 150, "【C-1】readSetup後、app.cfg.target=150");
    assert.strictEqual(app.cfg.coach, "off", "【C-1】readSetup後、app.cfg.coach='off'");
    for (const f of ["hints", "reading", "advice", "cand", "sighonest", "counts", "assistHi", "missGuard"]) {
      assert.strictEqual(app.cfg[f], false, "【C-1】readSetup後、app.cfg." + f + "=false(補助全OFF)");
    }
    console.log("PASS (C-1-0): applyLadderPreset(\"tournament\")+readSetupがEW=strong/target150/補助全OFF/coach offを機械的に反映する");
  }

  // ================================================================
  // (1) チェックリストに「大会仕様で一局とおす」ボタンが新設されている
  // ================================================================
  {
    T.openReadinessChecklist();
    const html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes('id="rc-tour-start"'), "【C-1】チェックリストに「大会仕様で一局とおす」ボタンがある");
    const btn = doc.getElementById("rc-tour-start");
    assert.strictEqual(btn.textContent, "大会仕様で一局とおす");
    console.log("PASS (C-1-1): 「大会仕様で一局とおす」ボタンの存在");
  }

  // ================================================================
  // (2) 押すと確認モーダル(文言+開始/やめるの2択)が出る
  // ================================================================
  {
    const btn = doc.getElementById("rc-tour-start");
    btn.click();
    const html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("150点先取・最強AI・全補助なしの大会仕様に設定を変えて対局を始めます"),
      "【C-1】確認モーダルの文言: " + html.slice(0, 300));
    assert.ok(doc.getElementById("rts-go"), "【C-1】確認モーダルに「開始」ボタンがある");
    assert.ok(doc.getElementById("rts-cancel"), "【C-1】確認モーダルに「やめる」ボタンがある");
    assert.strictEqual(doc.getElementById("rts-go").textContent, "開始");
    assert.strictEqual(doc.getElementById("rts-cancel").textContent, "やめる");
    console.log("PASS (C-1-2): 確認モーダルの表示(文言+開始/やめるの2択)");
  }

  // ---- (2b) 「やめる」を押すと何も変わらずモーダルが閉じる ----
  {
    const cfgBefore = JSON.stringify(app.cfg);
    const tiersBefore = JSON.stringify(app.tiers);
    doc.getElementById("rts-cancel").click();
    assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), false, "【C-1】「やめる」でモーダルが閉じる");
    assert.strictEqual(JSON.stringify(app.cfg), cfgBefore, "【C-1】「やめる」ではapp.cfgが変化しない");
    assert.strictEqual(JSON.stringify(app.tiers), tiersBefore, "【C-1】「やめる」ではapp.tiersが変化しない");
    console.log("PASS (C-1-2b): 「やめる」では設定変更も対局開始もされない");
  }

  // ================================================================
  // (3) 「開始」を押すと大会仕様が適用され、対局が始まる(closeModal→enterGame(false))
  // ================================================================
  {
    // いったん「はじめて」寄りへ戻す
    doc.getElementById("cfg-hints").checked = true;
    doc.getElementById("cfg-EW").value = "naive";
    doc.getElementById("cfg-target").value = "500";
    app.stopped = true;

    T.openReadinessChecklist();
    doc.getElementById("rc-tour-start").click();
    assert.ok(doc.getElementById("rts-go"), "前提: 確認モーダルが開いている");
    doc.getElementById("rts-go").click();

    assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), false, "【C-1】「開始」でモーダルが閉じる");
    assert.strictEqual(app.tiers.W, "strong", "【C-1】「開始」で大会仕様(EW=strong)が適用される");
    assert.strictEqual(app.cfg.target, 150, "【C-1】「開始」で大会仕様(target=150)が適用される");
    assert.strictEqual(app.cfg.hints, false, "【C-1】「開始」で補助(hints)がOFFになる");
    assert.strictEqual(app.humanSeat, "S", "【C-1】enterGame(false)により人間参加(観戦ではない)");
    assert.strictEqual(doc.getElementById("main-screen").classList.contains("show"), true,
      "【C-1】enterGame(false)で対局画面へ切り替わる");
    assert.strictEqual(app.stopped, false, "【C-1】対局が開始されている(app.stopped=false)");
    console.log("PASS (C-1-3): 「開始」で大会仕様の適用+対局開始(closeModal→enterGame(false))");
  }

  // ---- (3b) 設定は恒久的に大会仕様のまま(退避・復元されない) ----
  {
    T.stopToSetup();
    assert.strictEqual(doc.getElementById("cfg-EW").value, "strong",
      "【C-1】設定画面へ戻ってもEW=strongのまま(恒久的な変更。退避・復元しない)");
    assert.strictEqual(doc.getElementById("cfg-target").value, "150",
      "【C-1】設定画面へ戻ってもtarget=150のまま");
    assert.strictEqual(doc.getElementById("cfg-hints").checked, false,
      "【C-1】設定画面へ戻っても補助(hints)はOFFのまま(元の「はじめて」寄り設定へは戻さない)");
    console.log("PASS (C-1-3b): 大会仕様は恒久的に維持される(裏での退避・復元はしない)");
  }

  // ================================================================
  // (4) チェックリストの次の一歩の事実1行(未達項目に応じて表示)
  // ================================================================
  {
    // 全て未達の状態を作る(足場ON・戦績なし・テンポ計データなし)
    for (const sf of T.SCAFFOLDS) app.cfg[sf.key] = true;
    window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 0, losses: 0}));
    app.matchRecs = []; app.importedRecs = [];
    let html = T.readinessChecklistHtml();
    assert.ok(html.includes("大会仕様の通し稽古で試せます。"),
      "【C-1】未達項目がある場合、次の一歩の事実1行が出る: " + html.slice(0, 500));
    console.log("PASS (C-1-4a): 未達項目がある場合の次の一歩の事実1行");
  }

  // ---- (4b) 3項目とも達成済みなら次の一歩の行は出ない(冗長な表示をしない) ----
  {
    for (const sf of T.SCAFFOLDS) app.cfg[sf.key] = false;   // item1達成
    window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 5, losses: 1}));   // item2達成
    function fakeMove(thinkMs, agree) { return {human: true, forced: false, thinkMs, cf: {agree}}; }
    function fakeRec(moves) { return {sc: {ah: false, ad: false, mg: false, ct: false, rq: false, lb: false, tp: false, ex: false, rd: false, ht: false}, moves}; }
    const moves = [];
    for (let i = 0; i < 20; i++) moves.push(fakeMove(2000, true));
    for (let i = 0; i < 20; i++) moves.push(fakeMove(30000, true));
    app.matchRecs = [fakeRec(moves)]; app.importedRecs = [];   // item3達成(両帯とも高一致率)

    const html = T.readinessChecklistHtml();
    assert.ok(/✓.*全ての補助を外して打てる/.test(html), "前提: item1達成");
    assert.ok(/✓.*最強AI相手に150点先取で勝ち越せる/.test(html), "前提: item2達成");
    assert.ok(/✓.*速く打っても手が落ちない/.test(html), "前提: item3達成");
    assert.ok(!html.includes("大会仕様の通し稽古で試せます。"),
      "【C-1】3項目とも達成済みなら次の一歩の行は出ない(冗長表示を避ける): " + html);
    console.log("PASS (C-1-4b): 3項目達成済みなら次の一歩の行が出ない");
  }

  // ---- (4c) 次の一歩の文言に評価語・圧力表現・禁止語彙が無い(事実文であることの確認) ----
  {
    for (const sf of T.SCAFFOLDS) app.cfg[sf.key] = true;
    app.matchRecs = []; app.importedRecs = [];
    window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 0, losses: 0}));
    const html = T.readinessChecklistHtml();
    const forbidden = ["連続日数", "日連続", "ストリーク", "ポイント", "コイン", "経験値", "レベルアップ",
      "達成率", "トロフィー", "実績解除", "ログインボーナス", "サボ", "頑張", "がんばれ", "しなさい", "べきです"];
    for (const w of forbidden) {
      assert.ok(!html.includes(w), "【C-1】次の一歩の文言に禁止語彙/圧力表現「" + w + "」が無い");
    }
    console.log("PASS (C-1-4c): 次の一歩の文言に禁止語彙・圧力表現なし");
  }

  console.log("ALL C-1(tour) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
