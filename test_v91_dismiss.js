const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md A-3: grad_failedカードの「このまま続ける」が稽古札全体を当日抑制する不具合。
// #keiko-dismissには起動時にaddEventListener("click", keikoDismissToday)が恒久付与されており、
// keikoRenderCardがgrad_failed時にdismissBtn.onclick=gradTrialContinueへ置換したつもりでも
// addEventListenerとonclickは併存して両方発火する。「このまま続ける」を押すとgradTrialContinueと
// 同時にdismissedOn=今日が記録され、SRS期日カードを含む稽古札全体がその日消えてしまう。
// 修正: 起動時のaddEventListener(L15043)を廃止し、keikoRenderCardが全カード種で明示的にonclickを
// 設定する方式へ一本化する(due/weak/grad_proposeはkeikoDismissToday、grad_failedはgradTrialContinueのみ)。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  const sf = T.SCAFFOLDS.find(s => s.key === "hints");
  assert.ok(sf, "前提: SCAFFOLDSにhintsが存在する");

  // 前提: 稽古札の当日抑制キーはまだ書き込まれていない
  assert.strictEqual(window.localStorage.getItem(T.KEIKO_STORAGE_KEY), null,
    "前提: goita_keiko_v1はまだ何も書き込まれていない");

  // failed_pending状態のtrialを用意し、grad_failedカードを描画する(setup画面での実際の遷移を模す)
  T.gradSave({v: 1, trial: {key: sf.key, phase: "failed_pending", games: [], threshold: 0.7, rate: 0.5},
              cooldown: {}, graduated: {}});
  T.keikoRenderCard("grad_failed", {sf, rate: 0.5});

  const dismissBtn = doc.getElementById("keiko-dismiss");
  assert.strictEqual(dismissBtn.textContent, "このまま続ける", "前提: grad_failedのdismissラベルは「このまま続ける」");

  // 「このまま続ける」をクリック(addEventListenerとonclickが併存していれば両方発火する)
  dismissBtn.click();

  // gradTrialContinueの効果は発生する(意図どおり: 試行が継続する)
  const gAfter = T.gradLoad();
  assert.strictEqual(gAfter.trial && gAfter.trial.phase, "trial",
    "前提: 「このまま続ける」でtrial.phaseは'trial'に戻る(gradTrialContinueの効果)");

  // 【A-3】本題: 「このまま続ける」がgoita_keiko_v1のdismissedOnを書き換えていないこと
  // (=SRS期日カードを含む稽古札全体の当日抑制が発生していないこと)
  assert.strictEqual(window.localStorage.getItem(T.KEIKO_STORAGE_KEY), null,
    "【A-3】「このまま続ける」ではgoita_keiko_v1のdismissedOnが書き込まれない(当日抑制なし)");

  console.log("PASS (A-3-1): grad_failedの「このまま続ける」は稽古札全体を当日抑制しない");

  // ---- 回帰: dueカードの「今日はいい」は従来どおり当日抑制として機能する ----
  T.keikoRenderCard("due", {count: 2, days: 3});
  const dismissBtn2 = doc.getElementById("keiko-dismiss");
  assert.strictEqual(dismissBtn2.textContent, "今日はいい", "前提: dueのdismissラベルは「今日はいい」");
  dismissBtn2.click();
  const raw = window.localStorage.getItem(T.KEIKO_STORAGE_KEY);
  assert.ok(raw, "【回帰】dueカードの「今日はいい」はgoita_keiko_v1へdismissedOnを書き込む(従来どおり)");
  const parsed = JSON.parse(raw);
  assert.strictEqual(parsed.dismissedOn, T.today(), "【回帰】dismissedOnは本日の日付");

  console.log("PASS (A-3-2): dueカードの「今日はいい」は従来どおり当日抑制として機能する");

  console.log("ALL A-3(dismiss) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
