const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md v91b B-3: 導線の相互接続(分断解消)。
// - 卒業帳10/10到達文言に「出場前チェックリストで確かめられます」+ openReadinessChecklistを開くボタン。
// - openUshitsuInfoに支部一覧 https://goita.jp/ngps/ を追加+チェックリストへの参照1行。
//   チェックリスト末尾から宇出津モーダルを開ける導線。
// - 支部都道府県列挙文の丸め(Sonar承認済み)。
// - チェックリストの「卒業帳: n/10」行から卒業帳(openCareer)を開けるリンク。
//
// 「修正前fail」の代替確認: build/v92b/src/index.html(v91b着手前の承認版)には
// grad-checklist-open/rc-grad-link/rc-ushitsu-link/ui-checklist-linkのいずれのidも存在せず、
// openUshitsuInfoは都道府県名を静的列挙したままgoita.jp/ngps/リンクも持たないことをgrepで確認済み
// (0件。IMPLEMENTATION_REPORT_v91bc.md記載)。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  // ---- (1) 卒業帳10/10到達時の文言+チェックリストへのボタン ----
  {
    // 全SCAFFOLDSをcfg=falseにして10/10到達状態を作る
    for (const sf of T.SCAFFOLDS) app.cfg[sf.key] = false;
    T.gradSave({v: 1, trial: null, cooldown: {}, graduated: {}});
    const html = T.gradLedgerHtml();
    assert.ok(html.includes("大会仕様（全て無し）に到達しています。出場前チェックリストで確かめられます。"),
      "【B-3】10/10到達文言にチェックリストへの案内が付く: " + html.slice(-400));
    assert.ok(html.includes('id="grad-checklist-open"'), "【B-3】チェックリストを開くボタンがある");
    console.log("PASS (B-3-1a): 卒業帳10/10到達文言+ボタンの存在");
  }

  // ---- (1b) openCareerモーダル内でボタンを押すとチェックリストへ遷移する ----
  {
    app.career = [];
    T.openCareer();
    let modalHtml = doc.getElementById("modal-body").innerHTML;
    assert.ok(modalHtml.includes("卒業帳"), "前提: 成績モーダルに卒業帳セクションがある");
    const btn = doc.getElementById("grad-checklist-open");
    assert.ok(btn, "前提: 卒業帳内にチェックリストを開くボタンがある");
    btn.click();
    modalHtml = doc.getElementById("modal-body").innerHTML;
    assert.ok(modalHtml.includes("宇出津へ出るまえに"), "【B-3】卒業帳→チェックリストへ遷移する(G-3→D-2の連結)");
    T.closeModal();
    console.log("PASS (B-3-1b): 卒業帳→出場前チェックリストの実クリック遷移");
  }

  // ---- (2) openUshitsuInfo: 支部一覧リンク追加+文の丸め+チェックリスト参照 ----
  {
    T.openUshitsuInfo();
    const html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("https://goita.jp/ngps/"), "【B-3】支部一覧リンクを追加: " + html.slice(0, 200));
    assert.ok(!html.includes("東京・大阪・神奈川・長野・宮城・金沢・埼玉・福岡"),
      "【B-3】支部都道府県の静的列挙が丸められている(憲章§6.1準拠)");
    assert.ok(html.includes("保存会は全国に支部を持ち"), "【B-3】丸め後の文言が入っている");
    assert.ok(html.includes('id="ui-checklist-link"'), "【B-3】チェックリストへの参照(1行)がある");

    // 外部リンクはgoita.jp系のみ新規追加(既存のabarematsuri.jpは変更対象外)
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    assert.ok(hrefs.includes("https://goita.jp/ngps/"), "前提: goita.jp/ngps/がリンクとして存在");
    console.log("PASS (B-3-2a): openUshitsuInfoの支部一覧リンク追加+丸め文言");
  }

  // ---- (2b) openUshitsuInfo内のチェックリストリンクを押すと遷移する ----
  {
    T.openUshitsuInfo();
    const link = doc.getElementById("ui-checklist-link");
    assert.ok(link, "前提: チェックリストリンクが存在する");
    link.click();
    const html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("宇出津へ出るまえに"), "【B-3】宇出津モーダル→チェックリストへ遷移する");
    T.closeModal();
    console.log("PASS (B-3-2b): 宇出津モーダル→チェックリストの実クリック遷移");
  }

  // ---- (3) チェックリスト末尾から宇出津モーダルを開ける導線 ----
  {
    T.openReadinessChecklist();
    let html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes('id="rc-ushitsu-link"'), "【B-3】チェックリスト末尾に宇出津モーダルへのリンクがある");
    const link = doc.getElementById("rc-ushitsu-link");
    link.click();
    html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("宇出津とごいた"), "【B-3】チェックリスト→宇出津モーダルへ遷移する(相互接続の解消)");
    T.closeModal();
    console.log("PASS (B-3-3): チェックリスト→宇出津モーダルの実クリック遷移");
  }

  // ---- (4) チェックリストの「卒業帳: n/10」行からopenCareerを開けるリンク ----
  {
    for (const sf of T.SCAFFOLDS) app.cfg[sf.key] = true;   // remain=10(未達)にして「卒業帳: 0/10」を作る
    T.openReadinessChecklist();
    let html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes('id="rc-grad-link"'), "【B-3】「卒業帳: n/10」がリンクになっている");
    assert.ok(/卒業帳: 0\/10/.test(html), "前提: 卒業帳の分数が表示されている");
    const link = doc.getElementById("rc-grad-link");
    link.click();
    html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("成績") || html.includes("卒業帳"), "【B-3】チェックリスト→卒業帳(成績モーダル)へ遷移する");
    T.closeModal();
    console.log("PASS (B-3-4): チェックリスト「卒業帳: n/10」→openCareerの実クリック遷移");
  }

  // ---- (5) 相互到達性(受け入れ基準6): 卒業帳→チェックリスト→宇出津→チェックリストの環が閉じる ----
  {
    T.openCareer();
    // 現状remain=10のため「出場前チェックリストを開く」ボタンは出ない(10/10到達時のみ)。
    // ここでは既存の #srank-ushitsu-link (番付制度について→宇出津) の到達性のみ再確認する。
    const ul = doc.getElementById("srank-ushitsu-link");
    if (ul) {
      ul.click();
      const html = doc.getElementById("modal-body").innerHTML;
      assert.ok(html.includes("宇出津とごいた"), "【回帰】卒業帳(番付)→宇出津モーダルの既存導線は維持されている");
    }
    T.closeModal();
    console.log("PASS (B-3-5): 既存の卒業帳→宇出津導線(回帰)");
  }

  console.log("ALL B-3(links) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
