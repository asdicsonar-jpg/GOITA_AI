const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md v91b B-1: 卒業体験の完全化。
// - gradTrialStart成功時にtoast「「◯◯」を外して、3局はかります。」
// - renderKeikoPanel/keikoRenderCardに「試し中（n/3局）」の状態表示(既存#keiko-desc/#keiko-diag流用・
//   --aoiのみ。ボタンは「やめる」=gradTrialRevert相当のみ)。
// - gradOnGameFinishedの失敗分岐にもtoast「3局での一致率はn%でした。次に設定へ戻ったとき選べます。」
// - 卒業帳のfailed_pending表示を「判定待ち」に(従来「未使用」に落ちていた)。
// - 稽古札の優先順位: failed_pendingカードをSRS期日カードより上位へ。
//
// 「修正前fail」の代替確認: build/v92b/src/index.html(v91b着手前の承認版)にはこれらの文言・状態
// (grad_trial/判定待ち/toast文言/優先順位反転)が一切存在しないことをgrepで確認済み
// (0件。IMPLEMENTATION_REPORT_v91bc.mdに記録)。UI追加系のため「修正前は要素が存在しない」ことを
// もって再現テスト先行の代替とする。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  const sf = T.SCAFFOLDS.find(s => s.key === "hints");
  assert.ok(sf, "前提: SCAFFOLDSにhintsが存在する");

  // ---- (1) gradTrialStart成功時のtoast ----
  {
    app.cfg.hints = true;
    doc.getElementById("cfg-hints").checked = true;
    T.gradTrialStart(sf);
    const toastEl = doc.getElementById("toast");
    assert.ok(toastEl, "toast要素が生成される");
    assert.strictEqual(toastEl.textContent, "「" + sf.label + "」を外して、3局はかります。",
      "【B-1】gradTrialStart成功時に事実のみのtoastが出る");
    console.log("PASS (B-1-1): gradTrialStart成功時のtoast");
  }

  // ---- (2) 「試し中（n/3局）」状態表示 ----
  {
    T.gradSave({v: 1, trial: {key: sf.key, phase: "trial", at: T.today(), games: [{h: 5, ag: 4}], threshold: 0.65},
                cooldown: {}, graduated: {}});
    T.keikoRenderCard("grad_trial", {sf, n: 1});
    const desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.textContent, "「" + sf.label + "」を外して試し中（1/3局）です。",
      "【B-1】試し中の状態表示(n/3局)");
    assert.strictEqual(desc.style.color, "var(--aoi)", "【B-1】試し中の色は--aoiのみ");
    const diag = doc.getElementById("keiko-diag");
    assert.strictEqual(diag.style.display, "none", "【B-1】試し中はdiagを出さない");
    const actionBtn = doc.getElementById("keiko-action");
    assert.strictEqual(actionBtn.style.display, "none", "【B-1】試し中は「試す/戻す」等のactionボタンを出さない");
    const dismissBtn = doc.getElementById("keiko-dismiss");
    assert.notStrictEqual(dismissBtn.style.display, "none", "【B-1】試し中は「やめる」ボタンを表示する");
    assert.strictEqual(dismissBtn.textContent, "やめる", "【B-1】ボタンは「やめる」(gradTrialRevert相当)のみ");

    dismissBtn.click();
    assert.strictEqual(app.cfg[sf.key], true, "【B-1】「やめる」でcfgがtrueに戻る(gradTrialRevert)");
    const gAfter = T.gradLoad();
    assert.strictEqual(gAfter.trial, null, "【B-1】「やめる」でtrialがnullになる(卒業扱いにはしない)");
    console.log("PASS (B-1-2): 「試し中（n/3局）」状態表示とボタン構成");
  }

  // ---- (2b) 回帰: 他kindの再描画で試し中の見た目(色・非表示)が引き継がれない ----
  {
    T.keikoRenderCard("due", {count: 2, days: 1, allReviewed: false});
    const desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.style.color, "", "【回帰】dueカードにaoi色が引き継がれない");
    const actionBtn = doc.getElementById("keiko-action");
    assert.notStrictEqual(actionBtn.style.display, "none", "【回帰】dueカードのactionボタンは表示される");
    console.log("PASS (B-1-2b): 他kind再描画時にgrad_trial専用の見た目が引き継がれない");
  }

  // ---- (3) gradOnGameFinished失敗分岐のtoast ----
  {
    app.cfg.hints = false;
    app.rec = {sc: T.scaffoldStamp()};
    assert.strictEqual(app.rec.sc.ht, false, "前提: scaffoldStampがht:falseを返す(cfg.hints=falseのため)");
    T.gradSave({v: 1, trial: {key: sf.key, phase: "trial", at: T.today(), games: [{h: 10, ag: 1}, {h: 10, ag: 1}], threshold: 0.65},
                cooldown: {}, graduated: {}});
    T.gradOnGameFinished({h: 10, agree: 1});
    const toastEl = doc.getElementById("toast");
    assert.strictEqual(toastEl.textContent, "3局での一致率は10%でした。次に設定へ戻ったとき選べます。",
      "【B-1】失敗分岐にも成功時と対称のtoastが出る(現状は無通知だった)");
    const gAfter = T.gradLoad();
    assert.strictEqual(gAfter.trial.phase, "failed_pending", "前提: 3局目で閾値未達によりfailed_pendingへ");
    console.log("PASS (B-1-3): gradOnGameFinished失敗分岐のtoast");
  }

  // ---- (4) 卒業帳のfailed_pending表示「判定待ち」 ----
  {
    T.gradSave({v: 1, trial: {key: sf.key, phase: "failed_pending", at: T.today(), games: [], threshold: 0.65, rate: 0.1},
                cooldown: {}, graduated: {}});
    app.cfg[sf.key] = false;
    const html = T.gradLedgerHtml();
    assert.ok(html.includes("判定待ち"), "【B-1】failed_pendingの卒業帳表示は「判定待ち」: " + html);
    console.log("PASS (B-1-4): 卒業帳のfailed_pending表示「判定待ち」");
  }

  // ---- (5) 稽古札の優先順位: failed_pendingがSRS期日カードより上位 ----
  {
    // SRS期日カードを1件用意する(due)
    const store = {v: 1, cards: [{
      id: "due-card-1", kind: "joseki", payload: {key: "kakari"},
      ease: 0, due: T.today(), reps: 1, lapses: 0, last: T.today(),
    }]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));
    const due = T.keikoProposeDue();
    assert.ok(due, "前提: SRS期日カードが1件ある");

    // failed_pendingを用意する
    T.gradSave({v: 1, trial: {key: sf.key, phase: "failed_pending", at: T.today(), games: [], threshold: 0.65, rate: 0.1},
                cooldown: {}, graduated: {}});
    app.cfg[sf.key] = false;
    app._gradProposalCache = T.keikoProposeGradCompute();
    assert.strictEqual(app._gradProposalCache.kind, "grad_failed", "前提: keikoProposeGradComputeがgrad_failedを返す");

    T.renderKeikoPanel();
    const desc = doc.getElementById("keiko-desc");
    assert.ok(desc.textContent.includes("一致率"),
      "【B-1】failed_pendingがSRS期日カードより優先して表示される: " + desc.textContent);
    assert.ok(!desc.textContent.includes("詰め・定石が"),
      "【B-1】due文言(詰め・定石が...)ではなくfailed_pending文言が出ている");
    console.log("PASS (B-1-5): 稽古札の優先順位(failed_pending > SRS期日)");
  }

  // ---- (5b) 回帰: failed_pendingが無い場合はdueが優先どおり表示される ----
  {
    T.gradSave({v: 1, trial: null, cooldown: {}, graduated: {}});
    app._gradProposalCache = T.keikoProposeGradCompute();
    assert.strictEqual(app._gradProposalCache, null, "前提: 卒業関連の提案は無い");
    T.renderKeikoPanel();
    const desc = doc.getElementById("keiko-desc");
    assert.ok(desc.textContent.includes("詰め・定石が"),
      "【回帰】failed_pendingが無ければ従来どおりdueカードが表示される: " + desc.textContent);
    console.log("PASS (B-1-5b): failed_pending不在時はdueの優先順位が従来どおり");
  }

  console.log("ALL B-1(grad) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
