const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

// v92b(M-10・PLAN_v92_consistency.md): 評価器バージョンタグcfv。
// computeCoach完了時にrec.cfv=2を設定し、slimRecForStorageで永続化、career/coachHistoryの
// エントリにも伝播させる。ただし「computeCoachを呼んだが実際には何も新規算出しなかった」
// (=全moveに既にcfが付いている。旧バージョンで既に解析済みのレコードを再訪問した場合等)
// 呼び出しでは、その呼び出し自体はrec.cfvを新たに2へ書き換えない — 既存のcf値が
// 実際にどの評価器で算出されたか不明なレコードを、誤ってv2ラベルにしないため
// (「一致率の時系列が不連続になる。cfvタグで緩和する」という計画の意図に沿う判断。
// IMPLEMENTATION_REPORT_v92b.mdに詳細記載)。

function baseRec(parent, moves, initialHands) {
  return {
    gameNo: 1, matchNo: 1, parent,
    initialHands,
    scoresBefore: {NS: 0, EW: 0},
    moves,
    result: null,
  };
}

function simpleHumanRec() {
  // test_gotae.js (b)と同型の最小fixture(他3席は1枚のみ・監査対象外)。
  const initialHands = {N: ["馬"], W: ["馬"], S: ["香", "馬", "角", "銀", "飛", "金", "し", "し"], E: ["馬"]};
  const moves = [
    {seat: "S", human: true, action: {type: "bury", koma: "馬"}},
    {seat: "S", human: true, action: {type: "attack", koma: "香"}},
  ];
  return baseRec("S", moves, initialHands);
}

(async () => {
  const dom = buildDom();
  await wait(300);
  const T = dom.window.__T;
  const app = T.app;
  const G = T.G;

  // ---- (a) computeCoach完了時、新規に算出した手が1件以上あればrec.cfv=2が設定される ----
  {
    const rec = simpleHumanRec();
    assert.strictEqual(rec.cfv, undefined, "前提: computeCoach前はcfv未設定");
    T.computeCoach(rec);
    assert.strictEqual(rec.cfv, 2, "computeCoach完了時にrec.cfv=2が設定される(M-10)");
    assert.ok(rec.moves[1].cf, "対象の手にcfが算出されている(前提)");
    console.log("PASS (a): computeCoach完了時にrec.cfv=2が設定される");
  }

  // ---- (b) 既に全moveにcfがある(=新規計算なし)呼び出しはcfvを新たに2へ書き換えない ----
  {
    const rec = simpleHumanRec();
    T.computeCoach(rec);
    assert.strictEqual(rec.cfv, 2, "前提: 1回目の呼び出しでcfv=2");
    // 「旧バージョンで解析済み・cfvタグ無し」の状態を模す(cfのみ残しcfvを消す)
    rec.cfv = undefined;
    T.computeCoach(rec);   // 全moveに既にcfがあるため、この呼び出しは何も新規算出しない
    assert.strictEqual(rec.cfv, undefined,
      "全moveのcfが既存(新規算出なし)の呼び出しはcfvを2へ書き換えない(旧cfをv2ラベルで誤表示しない)");
    console.log("PASS (b): 新規算出が無い呼び出しはcfvを書き換えない(誤ラベル防止)");
  }

  // ---- (b-2) 既にcfv=2のレコードを再訪問(新規算出なし)してもcfv=2のまま維持される ----
  {
    const rec = simpleHumanRec();
    T.computeCoach(rec);
    assert.strictEqual(rec.cfv, 2, "前提: 1回目でcfv=2");
    T.computeCoach(rec);   // 2回目: 全moveに既にcfがあるため新規算出なし
    assert.strictEqual(rec.cfv, 2, "既にcfv=2のレコードの再訪問(新規算出なし)でもcfv=2のまま維持される(回帰なし)");
    console.log("PASS (b-2): cfv=2のレコード再訪問でcfv=2が維持される");
  }

  // ---- (c) slimRecForStorage往復でcfvが保存される。cfv未設定のレコードはnullになる ----
  {
    const rec = simpleHumanRec();
    T.computeCoach(rec);
    const slim = T.slimRecForStorage(rec);
    assert.strictEqual(slim.cfv, 2, "slimRecForStorageの出力にcfv=2が透過される");

    const recNoCfv = simpleHumanRec();   // computeCoachを呼ばない = cfv未設定のまま
    const slim2 = T.slimRecForStorage(recNoCfv);
    assert.strictEqual(slim2.cfv, null, "cfv未設定のレコードはslimRecForStorageでcfv:nullになる(旧レコード相当)");
    console.log("PASS (c): slimRecForStorage往復でcfvが保存される(未設定はnull)");
  }

  // ---- (d) career.push/coachHistory.pushのエントリにcfvが含まれる(onGameOver経由) ----
  {
    app.rng = G.mulberry32(1);
    app.parent = "S";
    app.stopped = false; app.matchOver = false;
    app.gameNo = 0; app.matchNo = 1;
    app.coachHistory = []; app.career = []; app.matchRecs = []; app.importedRecs = [];
    app.research = null;
    T.readSetup(false);
    assert.strictEqual(app.humanSeat, "S", "前提: 人間参加(S)");
    T.startGame();
    assert.strictEqual(app.st.actor, "S", "前提: 配牌後の手番はS(親)");
    const koma = app.st.hands.S[0];
    T.applyAndLog({type: "bury", koma});
    assert.strictEqual(app.rec.moves.length, 1, "前提: 人間の手が1手記録されている");

    const res = {winner: "S", pts: 10, koma: "し", dbl: false, recvFinish: false, draw: false};
    T.onGameOver(res);

    assert.strictEqual(app.rec.cfv, 2, "onGameOver後、app.rec.cfv=2(computeCoach経由)");
    assert.ok(app.coachHistory.length >= 1, "前提: coachHistoryに1件追加されている");
    assert.ok(app.career.length >= 1, "前提: careerに1件追加されている");
    assert.strictEqual(app.coachHistory[app.coachHistory.length - 1].cfv, 2, "coachHistoryの最新エントリにcfv=2が含まれる");
    assert.strictEqual(app.career[app.career.length - 1].cfv, 2, "careerの最新エントリにcfv=2が含まれる");
    console.log("PASS (d): onGameOver経由でcareer/coachHistoryのエントリにcfv=2が含まれる");
  }

  // ---- (e) 旧レコード(cfvなし)がloadCareerFromStorageの読込で壊れない ----
  {
    const legacyPayload = {
      version: 1, savedAt: new Date().toISOString(),
      career: [{matchNo: 1, g: 1, h: 3, agree: 2, miss: 1, hasty: 0, avgT: 4.2, byType: {}, hinted: false, sc: null}],   // cfvフィールドなし(旧形式)
      puzzleStats: {tried: 0, solved: 0},
      convTrust: {n: 0, ok: 0}, tblTrust: {n: 0, hit: 0},
      oppCounts: {pe: {n: 0, k: 0}, pp: {n: 0, k: 0}, bl: {n: 0, k: 0}},
      allGames: [{
        matchNo: 1, gameNo: 1, parent: "S",
        scoresBefore: {NS: 0, EW: 0},
        initialHands: {N: ["馬"], W: ["馬"], S: ["馬", "角", "銀", "飛", "金", "し", "し", "香"], E: ["馬"]},
        misses: [], result: {winner: "S", pts: 10, dbl: false, draw: false},
        // sc/cfvフィールドなし(旧形式)。moves中のcfも無し(旧形式では既解析済みの場合も無しの場合もある)。
        moves: [{seat: "S", action: {type: "bury", koma: "馬"}, human: true, thinkMs: 1000, why: "", cf: null, drillResult: null}],
      }],
    };
    dom.window.localStorage.setItem(T.CAREER_STORAGE_KEY, JSON.stringify(legacyPayload));
    app.career = []; app.importedRecs = [];
    assert.doesNotThrow(() => T.loadCareerFromStorage(), "旧形式(cfvなし)データの読込で例外が発生しない");
    assert.strictEqual(app.career.length, 1, "旧形式のcareerが読み込まれる");
    assert.strictEqual(app.career[0].cfv, undefined, "旧形式のcareerエントリはcfv未設定のまま(壊れない)");
    assert.strictEqual(app.importedRecs.length, 1, "旧形式のallGamesがimportedRecsへ読み込まれる");
    assert.strictEqual(app.importedRecs[0].cfv, undefined, "旧形式のレコードはcfv未設定のまま(壊れない)");

    // 読み込んだ旧レコードに対して振り返り系の再解析(ensureAnalyzed相当)を実行しても例外なく動作すること
    assert.doesNotThrow(() => T.computeCoach(app.importedRecs[0]), "旧形式レコードへのcomputeCoach再実行が例外を出さない");
    console.log("PASS (e): 旧レコード(cfvなし)はloadCareerFromStorageの読込・再解析で壊れない");
  }

  console.log("\nALL v92b CFV TESTS PASSED");
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
