const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md A-2: SRS詰め復習が setup 画面の裏で開始され、何も見えない不具合。
// srsReviewStart→srsReviewPuzzle→startPractice には画面切替コードが無く、#main-screen に .show が
// 付かないため盤外で人間の手番入力を待ち続ける(定石カード=モーダルは動くため挙動が割れる)。
// 修正: ensureGameScreen()ヘルパーを新設しsrsReviewStart開始時・openPastSelf経路で呼ぶ。
// キュー完了時には復習件数の事実表示+「設定へ戻る」ボタンの完了モーダルを出す。
//
// REVIEW_REPORT_v91a.md Must-fix1対応: app._srsReviewedCountはdequeue直後ではなく「実際に
// 提示した時点」(srsReviewPuzzleのprobe成功後・srsReviewJosekiの表示成功後)でのみ増やす。
// 読み飛ばした(probe=nullでスキップ・未知kindでスキップ)カードは件数に含めず、1件も提示できな
// かった場合は完了モーダルが「復習できる問題はありませんでした。」という正確な事実文になる。
//
// PLAN_v91_taikai_pipeline.md B-4(v91b・REVIEW_REPORT_v91a.md Nice-to-have1対応): ensureGameScreen()
// の呼び出しをsrsReviewStart冒頭からsrsReviewPuzzle側(probe成功後・startPractice直前)へ移した。
// キューが定石(モーダルのみ)カードだけの場合や、詰めカードのprobeが失敗して読み飛ばされる場合は、
// 対局画面へ一切切り替えない(フレッシュ起動直後に空の盤面が一瞬見える不具合を避ける)。
// ケース1はこの変更を受けて「main-screenへ切り替わらない」ことを断言するよう更新した
// (詰めカードが実際に提示された場合に切り替わることはケース2で引き続き断言する)。

function isSetupVisible(doc) {
  const d = doc.getElementById("setup-screen").style.display;
  return d !== "none";
}
function isMainShown(doc) {
  return doc.getElementById("main-screen").classList.contains("show");
}

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;
  const doc = window.document;

  // 実局47手(test_real24.jsと同一fixture)の中盤(upto=35)はSolverの読み対象内
  // (freshSolverProbeが非null)になる実データ。ケース2・3で共有する。
  const initialHands2 = {
    N: ["し", "し", "王", "王", "金", "香", "香", "馬"],
    W: ["し", "し", "し", "角", "角", "金", "銀", "馬"],
    S: ["し", "し", "銀", "銀", "銀", "飛", "香", "馬"],
    E: ["し", "し", "し", "金", "金", "飛", "香", "馬"],
  };
  const seq2 = [
    ["W", "bury", "し"], ["W", "attack", "角"], ["S", "pass", null], ["E", "pass", null], ["N", "pass", null],
    ["W", "bury", "し"], ["W", "attack", "角"], ["S", "pass", null], ["E", "pass", null], ["N", "receive", "王"],
    ["N", "attack", "香"], ["W", "pass", null], ["S", "pass", null], ["E", "receive", "香"],
    ["E", "attack", "金"], ["N", "pass", null], ["W", "pass", null], ["S", "pass", null],
    ["E", "bury", "し"], ["E", "attack", "飛"], ["N", "pass", null], ["W", "pass", null], ["S", "receive", "飛"],
    ["S", "attack", "香"], ["E", "pass", null], ["N", "pass", null], ["W", "pass", null],
    ["S", "bury", "銀"], ["S", "attack", "銀"], ["E", "pass", null], ["N", "pass", null], ["W", "receive", "銀"],
    ["W", "attack", "金"], ["S", "pass", null], ["E", "pass", null], ["N", "receive", "金"],
  ];
  const moves2 = seq2.map(([seat, type, koma]) => ({seat, human: seat === "S", action: {type, koma: koma || null}}));

  // ---- ケース1: probe=nullで読み飛ばした場合、完了モーダルは「復習した」と嘘の件数を言わない ----
  // 前提: 起動直後はsetup画面が見えていて、main-screenは.showが付いていない
  assert.ok(isSetupVisible(doc), "前提: 起動直後はsetup-screenが見えている");
  assert.strictEqual(isMainShown(doc), false, "前提: main-screenはまだ.showが付いていない");

  // 期日超過のSRSカードを1件、直接ストアへ注入する(upto:0の完全な8枚配牌はSolverの読み対象外
  // = freshSolverProbeがnullを返し、srsReviewPuzzleが即座に読み飛ばす確定パス。何も提示されない)
  const rng = G.mulberry32(7);
  const hands = G.dealOnce(rng);
  const chk = G.goshiCheck(hands, "S", "S");
  assert.ok(!chk.special && !chk.redeal && !chk.needHuman, "前提: seed=7は特殊/配り直し/五し相談なしの通常配牌");
  const store = {
    v: 1,
    cards: [{
      id: "test-puzzle-1", kind: "puzzle",
      payload: {parent: "S", initialHands: hands, upto: 0, moves: []},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today(),
    }],
  };
  window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));

  T.srsReviewStart();

  // 【B-4(v91b)】復習開始直後: probeが失敗し1件も提示できないキューでは、画面を切り替えない
  // (ensureGameScreenはsrsReviewPuzzleのprobe成功後のみ呼ばれるため)。setup-screenのまま。
  assert.strictEqual(isMainShown(doc), false, "【B-4】詰めのみ提示できないキューではmain-screenへ切り替わらない");
  assert.strictEqual(isSetupVisible(doc), true, "【B-4】詰めのみ提示できないキューではsetup-screenのまま");

  // upto:0局面はSolverの読み対象外(freshSolverProbeがnull)のためsrsReviewPuzzleが即座に
  // srsReviewNext()へ読み飛ばし、キューが同期的に空になって完了モーダルが出る。
  // 【Must-fix1】1件も提示していないので「復習しました」と件数を偽って言わない。
  const modalHtml = doc.getElementById("modal-body").innerHTML;
  assert.ok(doc.getElementById("ov-modal").classList.contains("show"), "【A-2】キュー完了時: モーダルが表示される");
  assert.ok(modalHtml.includes("復習できる問題はありませんでした"),
    "【Must-fix1】1件も提示できなかった場合は正確な事実文になる: " + modalHtml);
  assert.ok(!/\d+問を復習しました/.test(modalHtml),
    "【Must-fix1】読み飛ばしただけなのに「n問を復習しました」という事実でない件数を出さない: " + modalHtml);
  const backBtn = doc.querySelector("#modal-body button");
  assert.ok(backBtn, "【A-2】完了モーダルに「設定へ戻る」等のボタンがある");

  // 「設定へ戻る」— 対局保存に触れない軽量遷移(stopToSetup相当)でsetup画面に戻る(元々setup画面のまま)
  backBtn.click();
  assert.strictEqual(isSetupVisible(doc), true, "【A-2】「設定へ戻る」後: setup-screenのまま");
  assert.strictEqual(isMainShown(doc), false, "【A-2】「設定へ戻る」後もmain-screenに.showは付いていない");

  console.log("PASS (A-2-1/B-4): 詰めのみ提示できないキューでは画面を切り替えず、読み飛ばし時は正確な0件表示になる");

  // ---- ケース2: probe成功で実際に提示されたカードは件数に正しく計上される ----
  const store2 = {
    v: 1,
    cards: [{
      id: "test-puzzle-2", kind: "puzzle",
      payload: {parent: "W", initialHands: initialHands2, upto: 35, moves: moves2},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today(),
    }],
  };
  window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store2));

  T.srsReviewStart();

  // probeが成功しstartPracticeへ進んだ時点(=カードが実際に画面へ提示された時点)でのみ
  // app._srsReviewedCountが増える。まだ完了モーダルは出ていない(1問を提示して回答待ち中)。
  assert.strictEqual(isMainShown(doc), true, "【A-2-2】提示された詰めカードでmain-screenが見える");
  assert.strictEqual(app.drill && app.drill.isPuzzle, true, "前提: 詰めカードが実際に提示され練習状態になっている");
  assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), false,
    "前提: 完了モーダルはまだ出ていない(1問を提示して回答待ち中)");
  assert.strictEqual(app._srsReviewedCount, 1,
    "【Must-fix1】実際に提示した時点でapp._srsReviewedCountが1になる");

  console.log("PASS (A-2-2): probe成功で実際に提示されたカードは件数に正しく計上される");

  // ---- ケース3: openPastSelf経路でも画面が保証される(防御) ----
  const pastStore = {
    v: 1,
    pins: [{
      id: "test-pin-1", at: T.today(),
      payload: {parent: "W", initialHands: initialHands2, upto: moves2.length, moves: moves2},
      missIdx: 35,
    }],
  };
  window.localStorage.setItem(T.PAST_STORAGE_KEY, JSON.stringify(pastStore));

  // main-screenを明示的に隠し、setup画面にいる状態を再現してからopenPastSelfを呼ぶ(防御の確認)
  T.closeModal();
  doc.getElementById("main-screen").classList.remove("show");
  doc.getElementById("setup-screen").style.display = "";
  assert.strictEqual(isMainShown(doc), false, "前提3: main-screenを明示的に隠した");

  T.openPastSelf("test-pin-1");
  assert.strictEqual(isMainShown(doc), true, "【A-2防御】openPastSelf経路でもmain-screenに.showが付く");
  assert.strictEqual(isSetupVisible(doc), false, "【A-2防御】openPastSelf経路でもsetup-screenが非表示になる");

  console.log("PASS (A-2-3): openPastSelf経路でも画面切替が保証される(防御)");

  console.log("ALL A-2(srsscreen) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
