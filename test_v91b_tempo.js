const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md v91b B-2: テンポ計・チェックリスト項目3の事実表示強化。
// - 片側判定化: 「snap側がslow側より10pt超低い場合のみ未達」(達成方向にのみ緩和)。
//   従来はabs(snap-slow)の絶対差で判定していたため、速く打つ方が一致率が高い場合まで不合格にしていた。
// - 項目3のsubに帯別の不足を事実表示(例:「20秒超の手があとn手で集計できます」)。
// - 全帯ゼロ時の案内文をチェックリストにも表示(tempoHtml()と同文言)。
// - due札文言: reps>0のカードは「前回解いた」基準の文言に。
//
// 「修正前fail」の代替確認: build/v92b/src/index.html(v91b着手前の承認版)のreadinessChecklistHtml
// はabs(snap-slow)の対称判定のみで片側判定・帯別不足・全帯ゼロ案内・reps分岐のいずれも実装しておらず、
// 該当文言・ロジックが存在しないことを確認済み(IMPLEMENTATION_REPORT_v91bc.md記載)。

function fakeMove(thinkMs, agree) {
  return {human: true, forced: false, thinkMs, cf: {agree}};
}
function fakeRec(moves) {
  return {sc: {ah: false, ad: false, mg: false, ct: false, rq: false, lb: false, tp: false, ex: false, rd: false, ht: false}, moves};
}
function makeBinMoves(n, agreeCount, msPerMove) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(fakeMove(msPerMove, i < agreeCount));
  return arr;
}

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  // ---- (1) 片側判定化: snapがslowより良い場合(従来は不合格・是正後は合格) ----
  {
    app.matchRecs = [fakeRec([
      ...makeBinMoves(20, 20, 2000),    // snap: 20手・一致率100%
      ...makeBinMoves(20, 10, 30000),   // slow: 20手・一致率50%
    ])];
    app.importedRecs = [];
    const html = T.readinessChecklistHtml();
    assert.ok(/✓ 速く打っても手が落ちない/.test(html),
      "【B-2】snapがslowより高精度な場合は項目3が達成扱いになる(片側判定化): " + html.slice(0, 400));
    console.log("PASS (B-2-1a): 片側判定化 — snapが良い場合は達成");
  }

  // ---- (1b) 片側判定化: snapがslowより悪い場合(従来どおり不合格のまま) ----
  {
    app.matchRecs = [fakeRec([
      ...makeBinMoves(20, 10, 2000),    // snap: 20手・一致率50%
      ...makeBinMoves(20, 20, 30000),   // slow: 20手・一致率100%
    ])];
    const html = T.readinessChecklistHtml();
    assert.ok(/─ 速く打っても手が落ちない/.test(html),
      "【B-2】snapがslowより10pt超低い場合は引き続き未達: " + html.slice(0, 400));
    console.log("PASS (B-2-1b): 片側判定化 — snapが悪い場合は引き続き未達(既達成者への影響なし)");
  }

  // ---- (1c) 境界値: ちょうど10pt差は達成、11pt差は未達 ----
  {
    app.matchRecs = [fakeRec([
      ...makeBinMoves(20, 14, 2000),    // snap: 70%
      ...makeBinMoves(20, 16, 30000),   // slow: 80% (差10pt)
    ])];
    let html = T.readinessChecklistHtml();
    assert.ok(/✓ 速く打っても手が落ちない/.test(html), "【B-2】差ちょうど10ptは達成(境界値)");

    app.matchRecs = [fakeRec([
      ...makeBinMoves(20, 14, 2000),    // snap: 70%
      ...makeBinMoves(20, 17, 30000),   // slow: 85% (差15pt)
    ])];
    html = T.readinessChecklistHtml();
    assert.ok(/─ 速く打っても手が落ちない/.test(html), "【B-2】差11pt以上は未達");
    console.log("PASS (B-2-1c): 片側判定化の境界値(10pt)");
  }

  // ---- (2) 帯別不足の事実表示 ----
  {
    app.matchRecs = [fakeRec([
      ...makeBinMoves(5, 5, 2000),      // snap: 5手のみ(不足)
      ...makeBinMoves(3, 3, 10000),     // mid: item3には使わないが totalN>0 にする
    ])];
    const html = T.readinessChecklistHtml();
    assert.ok(html.includes("5秒以内の手があと15手で集計できます"),
      "【B-2】snap帯の不足を事実表示: " + html.slice(0, 600));
    assert.ok(html.includes("20秒超の手があと20手で集計できます"),
      "【B-2】slow帯(0手)の不足を事実表示: " + html.slice(0, 600));
    console.log("PASS (B-2-2): 帯別不足の事実表示");
  }

  // ---- (3) 全帯ゼロ時の案内文 ----
  {
    app.matchRecs = [];
    app.importedRecs = [];
    const html = T.readinessChecklistHtml();
    const tempoText = "まだデータがありません。全ての補助を外した状態（大会仕様）で対局すると集計されます。";
    assert.ok(html.includes(tempoText), "【B-2】全帯ゼロ時、tempoHtml()と同じ案内文をチェックリストにも表示: " + html.slice(0, 600));
    // 回帰: tempoHtml()自体の文言も同一であることを確認(表現の一貫性)
    const tempoHtml = T.tempoHtml();
    assert.ok(tempoHtml.includes(tempoText), "前提: tempoHtml()側の文言は不変");
    console.log("PASS (B-2-3): 全帯ゼロ時の案内文");
  }

  // ---- (4) due札文言: reps>0で「前回解いた」基準に ----
  {
    // (a) reps=0(未経験)・days>0 → 従来どおり「覚えた」
    let data = {kind: "due", count: 2, days: 3, allReviewed: false};
    T.keikoRenderCard("due", data);
    let desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.textContent, "3日前に覚えた詰め・定石が2問あります。まだ解けますか？",
      "【回帰】reps=0(未経験)は従来どおり「覚えた」基準");

    // (b) allReviewed=true・days>0 → 「n日前に解いた」
    data = {kind: "due", count: 2, days: 3, allReviewed: true};
    T.keikoRenderCard("due", data);
    desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.textContent, "3日前に解いた詰め・定石が2問あります。まだ解けますか？",
      "【B-2】全カードがreps>0(2回目以降)なら「n日前に解いた」基準");

    // (c) allReviewed=true・days<=0 → 「前回解いた」
    data = {kind: "due", count: 1, days: 0, allReviewed: true};
    T.keikoRenderCard("due", data);
    desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.textContent, "前回解いた詰め・定石が1問あります。まだ解けますか？",
      "【B-2】reps>0・当日中は「前回解いた」");

    // (d) allReviewed=false・days<=0 → 従来どおり「覚えた」(unchanged)
    data = {kind: "due", count: 1, days: 0, allReviewed: false};
    T.keikoRenderCard("due", data);
    desc = doc.getElementById("keiko-desc");
    assert.strictEqual(desc.textContent, "覚えた詰め・定石が1問あります。まだ解けますか？",
      "【回帰】reps=0・当日中は従来どおり「覚えた」(前置詞無し)");

    console.log("PASS (B-2-4): due札文言のreps>0分岐");
  }

  // ---- (4b) keikoProposeDueがallReviewedを正しく算出する(実データ経由) ----
  {
    const store = {v: 1, cards: [
      {id: "c1", kind: "joseki", payload: {key: "kakari"}, ease: 1, due: T.today(), reps: 2, lapses: 0, last: T.addDays(T.today(), -2)},
      {id: "c2", kind: "joseki", payload: {key: "kakari"}, ease: 1, due: T.today(), reps: 3, lapses: 0, last: T.addDays(T.today(), -2)},
    ]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));
    let due = T.keikoProposeDue();
    assert.strictEqual(due.allReviewed, true, "【B-2】全カードがreps>0ならallReviewed=true");

    store.cards.push({id: "c3", kind: "joseki", payload: {key: "kakari"}, ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()});
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));
    due = T.keikoProposeDue();
    assert.strictEqual(due.allReviewed, false, "【B-2】1件でもreps=0が混在すればallReviewed=false(安全側)");
    console.log("PASS (B-2-4b): keikoProposeDueのallReviewed算出(実データ)");
  }

  console.log("ALL B-2(tempo) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
