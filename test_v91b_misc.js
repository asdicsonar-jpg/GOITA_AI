const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// PLAN_v91_taikai_pipeline.md v91b B-4: こまごまの整合修正。
// - initMatchResumeUI()をstopToSetup()でも再評価。
// - today()のローカル日付化(addDays/daysBetweenは純粋なYYYY-MM-DDラベル計算のため無改修で一貫)。
// - srsSaveStoreのフォールバック是正(srsGrade適用済みオブジェクトを常に渡す)。
// - 定石復習の未採点離脱: Esc/閉じるで未採点のまま閉じたらキュー末尾へ回し「あとn問あります」を表示。
//   tut付き定石の「▶ 試す」ボタンは復習モーダルでは非表示。
// - 「過去の自分」ピンの既読化: pastShowCompare時にpin.comparedAt=today()を記録しpastDueから除外。
// - modal()にaria-labelledby自動接続(v90bから持ち越しのaria-dialog-name是正)。
//
// 「修正前fail」の代替確認: build/v92b/src/index.html(v91b着手前の承認版)には
// これらの挙動(resume-panelのstopToSetup再評価・today()のローカル化・comparedAt・
// aria-labelledby自動接続)が実装されておらず、該当コード片が存在しないことを確認済み
// (IMPLEMENTATION_REPORT_v91bc.md記載)。

(async () => {
  const dom = buildDom();
  const { window } = dom;
  await wait(300);
  const T = window.__T;
  const app = T.app;
  const doc = window.document;

  // ================================================================
  // (1) initMatchResumeUI()をstopToSetup()でも再評価する
  // ================================================================
  {
    // 前提: 起動直後は保存済みマッチが無いのでresume-panelは非表示
    const panel = doc.getElementById("resume-panel");
    assert.strictEqual(panel.style.display, "none", "前提: 起動直後はresume-panel非表示");

    // セッション中に対局を保存する(初期化後にlocalStorageへ直接書き込み、initMatchResumeUIを
    // 呼ばずにstopToSetup()だけを呼んでも反映されることを確認する)
    const savedData = {
      v: 1, savedAt: Date.now(), phase: "live",
      tiers: {N: "strong", W: "strong", S: "human", E: "strong"}, humanSeat: "S",
      scores: {NS: 10, EW: 0}, parent: "S", gameNo: 1, matchNo: 1,
      rec: {parent: "S", initialHands: {N: [], W: [], S: [], E: []}, moves: []},
    };
    window.localStorage.setItem("goita_match_v1", JSON.stringify(savedData));

    // まだresume-panelは古いまま(非表示)であることを確認してからstopToSetup()を呼ぶ
    assert.strictEqual(panel.style.display, "none", "前提: localStorage書き込み直後はまだUI未反映");

    T.stopToSetup();
    assert.notStrictEqual(panel.style.display, "none",
      "【B-4】stopToSetup()でinitMatchResumeUIが再評価されresume-panelが表示される");
    const desc = doc.getElementById("resume-desc");
    assert.ok(desc.textContent.length > 0, "【B-4】resume-descに内容が反映されている");

    window.localStorage.removeItem("goita_match_v1");
    T.stopToSetup();
    assert.strictEqual(panel.style.display, "none", "【B-4】保存が消えればstopToSetup()で再度非表示になる");
    console.log("PASS (B-4-1): initMatchResumeUIがstopToSetup()でも再評価される");
  }

  // ================================================================
  // (2) today()のローカル日付化
  // ================================================================
  {
    let toISOCalled = false;
    const origToISO = window.Date.prototype.toISOString;
    window.Date.prototype.toISOString = function (...args) { toISOCalled = true; return origToISO.apply(this, args); };
    const result = T.today();
    window.Date.prototype.toISOString = origToISO;
    assert.strictEqual(toISOCalled, false, "【B-4】today()はtoISOString()(UTC)をもう呼ばない");

    const d = new window.Date();
    const pad = n => String(n).padStart(2, "0");
    const expectedLocal = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    assert.strictEqual(result, expectedLocal, "【B-4】today()はローカルの年/月/日から構築される");
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result), "【B-4】従来と同じYYYY-MM-DD形式を維持(保存データ互換)");
    console.log("PASS (B-4-2a): today()がローカル日付(非UTC)から構築される");
  }

  // ---- (2b) addDays/daysBetweenは純粋なYYYY-MM-DDラベル計算のまま一貫している(回帰) ----
  {
    assert.strictEqual(T.addDays("2026-07-17", 1), "2026-07-18", "【B-4】addDaysの基本動作(回帰)");
    assert.strictEqual(T.addDays("2026-07-31", 1), "2026-08-01", "【B-4】addDaysの月またぎ(回帰)");
    assert.strictEqual(T.daysBetween("2026-07-01", "2026-07-17"), 16, "【B-4】daysBetweenの基本動作(回帰)");
    // today()が返す値を使ったラウンドトリップも従来どおり機能する
    const t = T.today();
    assert.strictEqual(T.daysBetween(t, t), 0, "【B-4】today()同士のdaysBetweenは0(自己無矛盾)");
    assert.strictEqual(T.addDays(t, 0), t, "【B-4】addDays(today(),0)はtoday()と一致(自己無矛盾)");
    console.log("PASS (B-4-2b): addDays/daysBetweenはUTC/ローカル混在の±1日ズレなく一貫している");
  }

  // ================================================================
  // (3) srsSaveStoreのフォールバック是正
  // ================================================================
  {
    const card = {id: "fallback-card-1", kind: "puzzle",
      payload: {parent: "S", initialHands: {N: [], W: [], S: [], E: []}, upto: 0, moves: []},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.addDays(T.today(), -5)};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify({v: 1, cards: [card]}));

    // srsLoad()で得られる別インスタンスに対してsrsGradeを適用(app._srsStoreとは無関係なオブジェクト)
    const loaded = T.srsLoad();
    const cardRef = loaded.cards.find(c => c.id === "fallback-card-1");
    T.srsGrade(cardRef, true);
    assert.strictEqual(cardRef.reps, 1, "前提: srsGrade適用でreps=1になる(メモリ上のcardRef)");

    // app._srsStoreを意図的に未設定(null)にし、フォールバック経路を強制する
    app._srsStore = null;
    T.srsPersistGradedCard(cardRef);

    const saved = JSON.parse(window.localStorage.getItem(T.SRS_STORAGE_KEY));
    const savedCard = saved.cards.find(c => c.id === "fallback-card-1");
    assert.ok(savedCard, "【B-4】保存後のstoreにcard-1が存在する");
    assert.strictEqual(savedCard.reps, 1, "【B-4】フォールバック経路でも採点(reps=1)が保存に反映される");
    assert.strictEqual(savedCard.ease, 1, "【B-4】フォールバック経路でも採点(ease=1)が保存に反映される");
    console.log("PASS (B-4-3a): srsSaveStoreフォールバック是正(app._srsStore未設定でも採点が保存される)");
  }

  // ---- (3b) 通常経路(app._srsStoreが設定済み)でも従来どおり動作する(回帰) ----
  {
    const card2 = {id: "normal-card-1", kind: "puzzle",
      payload: {parent: "S", initialHands: {N: [], W: [], S: [], E: []}, upto: 0, moves: []},
      ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()};
    const store2 = {v: 1, cards: [card2]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(store2));
    app._srsStore = store2;   // 通常のsrsReviewStart経路を模す(同一オブジェクト参照)
    T.srsGrade(card2, false);
    T.srsPersistGradedCard(card2);
    const saved2 = JSON.parse(window.localStorage.getItem(T.SRS_STORAGE_KEY));
    const savedCard2 = saved2.cards.find(c => c.id === "normal-card-1");
    assert.strictEqual(savedCard2.reps, 1, "【回帰】通常経路(app._srsStore設定済み)でも従来どおり保存される");
    assert.strictEqual(savedCard2.lapses, 1, "【回帰】不正解の採点も正しく保存される");
    app._srsStore = null;
    console.log("PASS (B-4-3b): srsSaveStore通常経路の回帰確認");
  }

  // ================================================================
  // (4) 定石復習の未採点離脱
  // REVIEW_REPORT_v91bc.md Must-fix1対応: 未採点離脱は復習セッションの「中断」として扱う。
  // 従来はキュー末尾へcardをpushしてsrsReviewNext()を即時呼び出していたため、キューに残るカードが
  // 1枚(=このcard自身)だけの場合は閉じた瞬間に同じモーダルが再表示され、採点しない限り脱出できな
  // かった(複数枚でも閉じるたびに次が開き続けた)。修正後はsrsReviewNext()を呼ばずセッションを終了し、
  // app._srsQueueを空にする(次回「復習する」で再構築)。カードはgrade()を経ていないためdueのまま
  // 残り、稽古札が後日あらためて提案する(データは失われない)。
  // ================================================================
  {
    // ---- (4a) 1枚キューでの未採点離脱: モーダルが再表示されず、キューが停止する ----
    // "kakari"はJOSEKI/JK_EXTRA双方に存在し、JK_EXTRA.kakari={tut:"kakari"}(dealは無し=jk-tryのみ出現)
    const jkStore = {v: 1, cards: [
      {id: "jk-card-1", kind: "joseki", payload: {key: "kakari"}, ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()},
    ]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(jkStore));

    T.srsReviewStart();
    let html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("定石: かかり応え"), "前提: 定石カードのモーダルが開いている");
    assert.ok(doc.getElementById("ov-modal").classList.contains("show"), "前提: モーダルが表示されている");

    // 【B-4】tut付き定石の「▶ 試す」は復習モーダルでは非表示
    const tryBtn = doc.getElementById("jk-try");
    assert.ok(tryBtn, "前提: このJOSEKIキーには「▶ 試す」ボタンが存在する(JK_EXTRA.kakari.tut)");
    assert.strictEqual(tryBtn.style.display, "none", "【B-4】復習モーダルでは「▶ 試す」が非表示");

    assert.strictEqual(app._srsReviewedCount, 1, "前提: 提示済みなのでreviewedCountが1");

    // Esc/背景クリック/「閉じる」ボタンいずれかに相当するcloseModal()を未採点のまま呼ぶ(abandon)
    T.closeModal();

    // 【Must-fix1(review)】モーダルが即座に再表示されない(黙って停止=セッション終了)
    assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), false,
      "【Must-fix1(review)】1枚キューでの未採点クローズ後、モーダルが再表示されず閉じたままになる(採点しない限り脱出できない不具合の修正)");
    html = doc.getElementById("modal-body").innerHTML;
    assert.ok(!html.includes("定石:"), "【Must-fix1(review)】同じ(または他の)定石モーダルが自動で再度開いていない");

    // 【Must-fix1(review)】キューが空になり状態を残さない(次回「復習する」でsrsDue()から再構築される)
    assert.strictEqual(app._srsQueue, null, "【Must-fix1(review)】未採点離脱でapp._srsQueueが空になる");

    // 【Must-fix1(review)】statusに中断時点の未消化枚数(このcard自身=1)が事実表示される
    const statusText = doc.getElementById("status-text").textContent;
    assert.strictEqual(statusText, "採点せずに閉じました。あと1問は期日のままです。",
      "【Must-fix1(review)】statusに中断時点の未消化枚数の事実表示が出る: " + statusText);

    // 再提示されていないため、reviewedCountは1のまま増えない
    assert.strictEqual(app._srsReviewedCount, 1, "【Must-fix1(review)】再提示されないためreviewedCountは増えない");

    // カードはgrade()を経ていないためreps=0のまま・dueは変化せず残る(データは失われない)
    const storeAfterAbandon = T.srsLoad();
    const cardAfterAbandon = storeAfterAbandon.cards.find(c => c.id === "jk-card-1");
    assert.ok(cardAfterAbandon, "【Must-fix1(review)】カード自体は削除されずstoreに残る");
    assert.strictEqual(cardAfterAbandon.reps, 0, "【Must-fix1(review)】未採点のためreps=0のまま(dueに残り後日再提案される)");
    assert.strictEqual(cardAfterAbandon.due, T.today(), "【Must-fix1(review)】dueは変更されない(grade()未実行)");

    console.log("PASS (B-4-4a): 1枚キューでの未採点離脱でモーダルが再表示されずキューが停止する(Must-fix1)");
  }

  // ---- (4b) 複数枚キューでの中断: 1枚目を未採点離脱すると2枚目が自動的に開かずセッションが停止する ----
  {
    const jkStoreMulti = {v: 1, cards: [
      {id: "jk-multi-1", kind: "joseki", payload: {key: "kakari"}, ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()},
      {id: "jk-multi-2", kind: "joseki", payload: {key: "kgb_pair"}, ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()},
    ]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(jkStoreMulti));

    T.srsReviewStart();
    let html = doc.getElementById("modal-body").innerHTML;
    assert.ok(html.includes("定石: かかり応え"), "前提: 1枚目(かかり応え)が提示されている");

    // 1枚目を未採点のまま閉じる
    T.closeModal();

    // 【Must-fix1(review)】2枚目が自動的に開かず、セッションが停止する
    assert.strictEqual(doc.getElementById("ov-modal").classList.contains("show"), false,
      "【Must-fix1(review)】複数枚キューでも未採点クローズでセッションが停止し、2枚目が自動的に開かない");
    html = doc.getElementById("modal-body").innerHTML;
    assert.ok(!html.includes("金銀馬リード"), "【Must-fix1(review)】2枚目(金銀馬リード=ペア)のモーダルが自動で開いていない");
    assert.strictEqual(app._srsQueue, null, "【Must-fix1(review)】キューが空になる(2枚目のカード自体は破棄されずdueに残るのみ)");

    // status: 1枚目自身(1) + 未提示だった2枚目(1) = あと2問
    const statusText = doc.getElementById("status-text").textContent;
    assert.strictEqual(statusText, "採点せずに閉じました。あと2問は期日のままです。",
      "【Must-fix1(review)】複数枚キューでは(1枚目+キュー残り1枚=2問)が事実表示される: " + statusText);

    // 両カードともgrade()を経ていないため、reps=0のままdueに残る
    const storeAfter = T.srsLoad();
    const c1 = storeAfter.cards.find(c => c.id === "jk-multi-1");
    const c2 = storeAfter.cards.find(c => c.id === "jk-multi-2");
    assert.strictEqual(c1.reps, 0, "【Must-fix1(review)】1枚目(提示済み・未採点)もreps=0のまま");
    assert.strictEqual(c2.reps, 0, "【Must-fix1(review)】2枚目(未提示)もreps=0のまま");

    console.log("PASS (B-4-4b): 複数枚キューでの中断でも2枚目が自動的に開かずセッションが停止する(Must-fix1)");
  }

  // ---- (4c) 未採点離脱時、直前の採点ボタンクリックでは誤ってabandon扱いにならない(回帰) ----
  {
    const jkStore2 = {v: 1, cards: [
      {id: "jk-card-2", kind: "joseki", payload: {key: "kakari"}, ease: 0, due: T.today(), reps: 0, lapses: 0, last: T.today()},
    ]};
    window.localStorage.setItem(T.SRS_STORAGE_KEY, JSON.stringify(jkStore2));
    T.srsReviewStart();
    const rows = doc.querySelectorAll("#modal-body .row button");
    const noBtn = [...rows].find(b => b.textContent === "忘れていた");
    noBtn.click();
    const statusText = doc.getElementById("status-text").textContent;
    assert.ok(!/採点せずに閉じました/.test(statusText),
      "【回帰】採点ボタンで正常に閉じた場合は未採点離脱のstatus文言が出ない: " + statusText);
    console.log("PASS (B-4-4c): 正常な採点クリックではabandonコールバックが発火しない(回帰)");
  }

  // ================================================================
  // (5) 「過去の自分」ピンの既読化
  // ================================================================
  {
    const oldDate = T.addDays(T.today(), -20);   // 14日基準を超えて期日超過
    const pastStore = {v: 1, pins: [{
      id: "pin-1", at: oldDate,
      payload: {parent: "S", initialHands: {N: [], W: [], S: [], E: []}, upto: 0,
        moves: [{seat: "S", human: true, action: {type: "bury", koma: "し"}}]},
      missIdx: 0,
    }]};
    window.localStorage.setItem(T.PAST_STORAGE_KEY, JSON.stringify(pastStore));

    let due = T.pastDue();
    assert.strictEqual(due.length, 1, "前提: 期日超過ピンが1件ある(comparedAt未設定)");

    // pastShowCompareを直接呼ぶ(onPracticeOverの実フローを模した最小の呼び出し)
    T.pastShowCompare({pastPin: due[0], nowMove: {type: "bury", koma: "銀"}, move: {type: "bury", koma: "し"}});

    const storeAfter = T.pastLoad();
    const pinAfter = storeAfter.pins.find(p => p.id === "pin-1");
    assert.ok(pinAfter, "【B-4】ピンは削除されず残っている");
    assert.strictEqual(pinAfter.comparedAt, T.today(), "【B-4】pastShowCompare時にcomparedAt=today()が記録される");

    due = T.pastDue();
    assert.strictEqual(due.length, 0, "【B-4】既読化(comparedAt)したピンはpastDueから除外される");
    console.log("PASS (B-4-5): 過去の自分ピンの既読化(削除せずcomparedAtでpastDueから除外)");
  }

  // ================================================================
  // (6) modal()のaria-labelledby自動接続
  // ================================================================
  {
    const m = T.modal('<h2 class="serif">テスト用タイトル</h2><p>本文</p><div class="row"><button id="x-close">閉じる</button></div>');
    const labelledby = m.getAttribute("aria-labelledby");
    assert.ok(labelledby, "【B-4】modal()がaria-labelledbyを設定する");
    const h2 = doc.getElementById(labelledby);
    assert.ok(h2, "【B-4】aria-labelledbyの参照先が実在するid");
    assert.strictEqual(h2.tagName, "H2", "【B-4】参照先は本文先頭のh2");
    assert.strictEqual(h2.textContent, "テスト用タイトル", "【B-4】正しいh2に接続されている");
    T.closeModal();
    console.log("PASS (B-4-6a): modal()のaria-labelledby自動接続(h2あり)");
  }

  // ---- (6b) h2が無いモーダルではaria-labelledbyを設定しない(回帰。無理に接続しない) ----
  {
    const m = T.modal('<p>h2の無い本文</p><div class="row"><button id="y-close">閉じる</button></div>');
    assert.strictEqual(m.hasAttribute("aria-labelledby"), false, "【回帰】h2が無いモーダルにはaria-labelledbyを付けない");
    T.closeModal();
    console.log("PASS (B-4-6b): h2が無いモーダルでは無理にaria-labelledbyを付けない(回帰)");
  }

  // ---- (6c) 既存モーダル(宇出津/チェックリスト等)も自動でaria-labelledbyが付く ----
  {
    T.openUshitsuInfo();
    const mb = doc.getElementById("modal-body");
    assert.ok(mb.getAttribute("aria-labelledby"), "【B-4】既存モーダル(宇出津)にもaria-labelledbyが自動で付く");
    T.closeModal();
    console.log("PASS (B-4-6c): 既存モーダルにも自動接続される(axe-core aria-dialog-name是正の根拠)");
  }

  console.log("ALL B-4(misc) TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
