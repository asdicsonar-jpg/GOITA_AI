const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// M-4(v92a, PLAN_v92_consistency.md): SRSカードにband/stageを保存し、有段stage1詰めの復習を成立させる。
// 有段(adv)stage1の出題条件は「G.freshSolverProbe(st,seat,false)がnullであること」そのもの(勘定だけで
// 確実なら不合格)。復習側は同じfreshSolverProbeを呼び、null=無言スキップとしていたため、stage1カードは
// 決定的に毎回スキップされ、dueが更新されず期日一覧に永遠残留していた。
// 修正: (1)srsAddPuzzle呼出時にband/stageをカードのトップレベルへ保存 (2)復習時、band="adv"&&stage=1の
// カードはadvProbeと同じ経路(凍結局面から敵実保有unseenEnemyを再構成しG.puzzleTruthProbe)で正解手を
// 取得 (3)band保存済みのadvカードは復習判定を「上がり切り」(onPracticeOverの結末判定)へ寄せる
// (4)bandの無い旧カードでprobe=nullならその場で削除し件数を1回だけ告知する。

function isMainShown(doc) { return doc.getElementById("main-screen").classList.contains("show"); }

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const G = T.G;
  const doc = window.document;

  // ---- (a) srsAddPuzzleがband/stageをカードのトップレベルに保存する ----
  {
    window.localStorage.removeItem(T.SRS_STORAGE_KEY);
    T.srsAddPuzzle({parent: "S", initialHands: {N: [], W: [], S: [], E: []}, upto: 0, moves: []}, "adv", 1);
    const store = T.srsLoad();
    assert.strictEqual(store.cards.length, 1);
    const card = store.cards[0];
    assert.strictEqual(card.band, "adv", "band='adv'がカードのトップレベルに保存される(M-4)");
    assert.strictEqual(card.stage, 1, "stage=1がカードのトップレベルに保存される(M-4)");
    assert.ok(card.payload && card.payload.initialHands, "payload(srsSlim本体)は従来どおり保存される");
    console.log("PASS (a): srsAddPuzzleでband/stageがカードのトップレベルに保存される(M-4)");
  }

  // ---- (b) 有段stage1カード(freshSolverProbeが構造的にnullを返す局面)が puzzleTruthProbe 経由で
  //      採点まで到達しdueが更新される(修正前は毎回無言スキップされ続けていた) ----
  {
    const rng = G.mulberry32(5);
    const hands = G.dealOnce(rng);
    const chk = G.goshiCheck(hands, "S", "S");
    assert.ok(!chk.special && !chk.redeal && !chk.needHuman, "前提: 特殊/配り直し/五し相談なしの通常配牌");
    // 前提確認: 完全な8枚配牌はfreshSolverProbeが構造的にnullを返す(=stage1カードの特徴そのもの)
    const st0 = G.newGameState(hands, "S");
    assert.strictEqual(G.freshSolverProbe(st0, "S", false), null, "前提: 8枚フル配牌はfreshSolverProbeがnull(stage1の特徴そのもの)");

    const store = {v: 1, cards: [{
      id: "adv-stage1-1", kind: "puzzle", band: "adv", stage: 1,
      payload: {parent: "S", initialHands: hands, upto: 0, moves: []},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.addDays(T.today(), -1),
    }]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));

    const origPTP = G.puzzleTruthProbe;
    G.puzzleTruthProbe = () => ({move: {type: "attack", koma: hands.S[0]}, second: null, score: 20, why: "Solver — テスト用(敵手の推測込み)"});
    try {
      T.srsReviewStart();
      assert.strictEqual(isMainShown(doc), true, "復習開始で盤が見える(A-2/v91a由来の前提が維持されている)");
      assert.strictEqual(app.drill && app.drill.isPuzzle, true, "stage1カードが読み飛ばされず実際に提示される(M-4)");
      assert.strictEqual(app.drill.band, "adv", "提示されたdrillのbandがadvへ引き継がれる(上がり切り判定へ寄せる経路)");
      assert.strictEqual(app.drill.stage, 1, "提示されたdrillのstageも引き継がれる");
      assert.strictEqual(app._srsReviewedCount, 1, "実際に提示された時点でカウントされる");

      // 採点: band==="adv"のためapplyAndLog/onPracticeOverの既存分岐が「上がり切り」判定へ自然に乗る。
      // ここでは人間(S)が上がった結末を直接投入して採点まで到達することを確認する。
      T.onPracticeOver({winner: "S", pts: 20});
      const storeAfter = T.srsLoad();
      const cardAfter = storeAfter.cards.find(c => c.id === "adv-stage1-1");
      assert.ok(cardAfter, "採点後もカードはストアに残る(削除されない)");
      assert.strictEqual(cardAfter.reps, 1, "repsが加算される(採点まで到達した証跡)");
      assert.ok(cardAfter.due > T.today(), "正解によりdueが未来日へ進む(復習が期日更新まで到達した=M-4の核心): " + cardAfter.due);
    } finally {
      G.puzzleTruthProbe = origPTP;
    }
    console.log("PASS (b): 有段stage1カードがpuzzleTruthProbe経由で採点まで到達しdueが更新される(M-4)");
  }

  // ---- (c) band情報のない旧カード(v91a以前生成)でprobe=nullなら、その場で削除され
  //      件数が1回だけ告知される(修正前は毎回無言スキップされ続け永遠残留していた) ----
  {
    const rng = G.mulberry32(9);
    const hands = G.dealOnce(rng);
    const chk = G.goshiCheck(hands, "S", "S");
    assert.ok(!chk.special && !chk.redeal && !chk.needHuman, "前提: 特殊/配り直し/五し相談なしの通常配牌");
    const st0 = G.newGameState(hands, "S");
    assert.strictEqual(G.freshSolverProbe(st0, "S", false), null, "前提: 8枚フル配牌はfreshSolverProbeがnull(旧カードは構造的に解けない)");

    const store = {v: 1, cards: [{
      // band/stageフィールドが無い = v91a以前に生成された旧カード
      id: "legacy-1", kind: "puzzle",
      payload: {parent: "S", initialHands: hands, upto: 0, moves: []},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.addDays(T.today(), -1),
    }]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));

    T.srsReviewStart();

    // 提示できるカードが無いので即座にキューが空になり完了モーダルが出る
    assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), true, "完了モーダルが出る");
    const modalHtml = doc.getElementById("modal-body").innerHTML;
    assert.ok(modalHtml.includes("解けない形になっていた復習カードを1件取り除きました"),
      "band無し旧カードの削除件数が事実として1回告知される(M-4): " + modalHtml);
    assert.ok(!/連続日数|ストリーク|コイン|経験値|レベルアップ|達成率|トロフィー|実績解除|ログインボーナス|日連続|ポイント|サボ/.test(modalHtml),
      "告知文言に禁止語彙・圧力表現を含まない: " + modalHtml);

    const storeAfter = T.srsLoad();
    assert.strictEqual(storeAfter.cards.find(c => c.id === "legacy-1"), undefined,
      "解けない旧カードはストアから削除される(M-4): " + JSON.stringify(storeAfter.cards));

    console.log("PASS (c): band無し旧カードでprobe=nullならその場で削除され件数が1回だけ告知される(M-4)");
  }

  // ---- (d) 回帰: band="mid"等(有段以外)の通常カードで、freshSolverProbeが成功する局面は
  //      従来どおり提示される(puzzleTruthProbe経路は使われない) ----
  {
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
    const store = {v: 1, cards: [{
      id: "mid-1", kind: "puzzle", band: "mid", stage: null,
      payload: {parent: "W", initialHands: initialHands2, upto: 35, moves: moves2},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.addDays(T.today(), -1),
    }]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store));

    T.srsReviewStart();
    assert.strictEqual(app.drill && app.drill.isPuzzle, true, "band=mid・stage無しでも従来どおりfreshSolverProbe経由で提示される(回帰なし)");
    assert.strictEqual(app.drill.band, "mid");
    console.log("PASS (d): band='mid'(有段以外)は従来どおりfreshSolverProbe経路のまま動作する(回帰なし)");
  }

  console.log("ALL v92 SRSADV TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
