const { buildDom, wait } = require("./harness.js");
const fs = require("fs");
const path = require("path");

// v91a検証: 新規文言(SRS完了モーダル・出場前チェックリストのn勝m敗sub)が表示される状態での
// axe-core構造スキャンを4テーマ(夜藍/生成り/高コントラスト/CUD)で実施し、
// 「新規追加UIを見せない基準状態」と比較して新規violationカテゴリが増えていないことを確認する。
//
// v91b/v91c追加(PLAN_v91_taikai_pipeline.md B-1/C-1): 「試し中」カード・「大会仕様で一局とおす」
// ボタン・確認モーダル・aria-labelledby自動接続後の各種モーダルを4テーマでスキャンする。
// wcag2a/wcag2aaタグに限定した従来のrunOnlyだと`aria-dialog-name`(best-practiceタグのみ)が
// 検出対象から外れるため、本ファイルの末尾で全ルール(タグ制限なし)によるaria-dialog-name専用の
// 前後比較(v92b基準=B-4のmodal()改修前 vs 本コミット)も別途実施する。
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.js"), "utf-8");

const THEMES = [
  {name: "夜藍(既定)", theme: "yoai", cud: false},
  {name: "生成り", theme: "kinari", cud: false},
  {name: "高コントラスト", theme: "hc", cud: false},
  {name: "CUD", theme: "yoai", cud: true},
];

async function runAxe(window) {
  window.eval(axeSrc);
  const results = await window.axe.run(window.document, {
    runOnly: {type: "tag", values: ["wcag2a", "wcag2aa"]},
  });
  return results.violations.map(v => v.id);
}

async function scanTheme(themeCfg, setupFn) {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  app.cfg.theme = themeCfg.theme;
  app.cfg.cud = themeCfg.cud;
  window.document.body.classList.toggle("theme-kinari", app.cfg.theme === "kinari");
  window.document.body.classList.toggle("theme-hc", app.cfg.theme === "hc");
  window.document.body.classList.toggle("cud", app.cfg.cud);
  if (setupFn) await setupFn(T, window);
  const violations = await runAxe(window);
  return violations;
}

(async () => {
  let anyNewViolation = false;
  for (const themeCfg of THEMES) {
    // 基準: 新規UIを何も出さない起動直後の状態
    const baseline = await scanTheme(themeCfg, null);

    // v91a新規UI: SRS復習の完了モーダル(件数の事実表示+「設定へ戻る」)
    const withSrsDone = await scanTheme(themeCfg, async (T, window) => {
      const store = {v: 1, cards: []};   // 空queueで即座に完了モーダルを出す
      window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));
      T.srsReviewStart();
    });

    // v91a新規UI: 出場前チェックリスト(item2のn勝m敗sub表示、勝ち越し/負け越し両方)
    const withChecklistLose = await scanTheme(themeCfg, async (T, window) => {
      window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 1, losses: 3}));
      T.openReadinessChecklist();
    });
    const withChecklistWin = await scanTheme(themeCfg, async (T, window) => {
      window.localStorage.setItem(T.TOURWIN_STORAGE_KEY, JSON.stringify({v: 1, wins: 3, losses: 1}));
      T.openReadinessChecklist();
    });

    // v91b新規UI: 稽古札の「試し中（n/3局）」カード(B-1)
    const withTrialCard = await scanTheme(themeCfg, async (T) => {
      const sf = T.SCAFFOLDS.find(s => s.key === "hints");
      T.keikoRenderCard("grad_trial", {sf, n: 1});
    });

    // v91c新規UI: 出場前チェックリストの「大会仕様で一局とおす」ボタン(C-1)
    const withTourBtn = await scanTheme(themeCfg, async (T) => {
      T.openReadinessChecklist();
    });

    // v91c新規UI: 「大会仕様で一局とおす」の確認モーダル(C-1)
    const withTourConfirm = await scanTheme(themeCfg, async (T, window) => {
      T.openReadinessChecklist();
      const btn = window.document.getElementById("rc-tour-start");
      if (btn) btn.click();
    });

    const newIn = (arr) => arr.filter(id => !baseline.includes(id));
    const newSrs = newIn(withSrsDone);
    const newLose = newIn(withChecklistLose);
    const newWin = newIn(withChecklistWin);
    const newTrial = newIn(withTrialCard);
    const newTourBtn = newIn(withTourBtn);
    const newTourConfirm = newIn(withTourConfirm);

    console.log(`--- ${themeCfg.name} ---`);
    console.log(`  baseline violations: [${baseline.join(", ")}]`);
    console.log(`  +SRS完了モーダル: 新規=[${newSrs.join(", ")}]`);
    console.log(`  +チェックリスト(負け越し): 新規=[${newLose.join(", ")}]`);
    console.log(`  +チェックリスト(勝ち越し): 新規=[${newWin.join(", ")}]`);
    console.log(`  +試し中カード(B-1): 新規=[${newTrial.join(", ")}]`);
    console.log(`  +通し稽古ボタン(C-1): 新規=[${newTourBtn.join(", ")}]`);
    console.log(`  +通し稽古確認モーダル(C-1): 新規=[${newTourConfirm.join(", ")}]`);

    if (newSrs.length || newLose.length || newWin.length || newTrial.length || newTourBtn.length || newTourConfirm.length) anyNewViolation = true;
  }

  if (anyNewViolation) {
    console.error("FAIL: 新規violationカテゴリが検出されました");
    process.exit(1);
  }
  console.log("ALL AXE SCANS(wcag2a/2aa): 新規violationカテゴリ0件(4テーマ×新規UI6状態)");

  // ================================================================
  // B-4(v91b): aria-dialog-name(best-practiceタグのみ・wcag2a/2aaのrunOnlyには含まれない)の
  // 解消確認。全ルール(タグ制限なし)でモーダル表示時にスキャンし、v91bc(本コミット)では
  // 検出されないことを確認する。v92b基準(modal()改修前)との前後比較はIMPLEMENTATION_REPORTに記録。
  // ================================================================
  {
    const dom = buildDom();
    const { window } = dom;
    await wait(300);
    const T = window.__T;
    T.openReadinessChecklist();
    window.eval(axeSrc);
    const results = await window.axe.run(window.document, {});   // タグ制限なし=best-practiceも含む全ルール
    const ariaDialogName = results.violations.find(v => v.id === "aria-dialog-name");
    if (ariaDialogName) {
      console.error("FAIL: aria-dialog-name違反が残存しています(modal()のaria-labelledby自動接続が効いていない)", ariaDialogName);
      process.exit(1);
    }
    console.log("aria-dialog-name(全ルールスキャン): 0件(B-4のmodal()改修で解消)");
  }

  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
