// v92b(M-10) 性能実測: computeCoach()の所要時間を変更前(v92a)/変更後(v92b)で比較する。
// 「人間手10手以上」の局を実対局相当(全席tierOpts strong相当のAIでプレイ)で構築し、
// 複数fixture(人間手9〜11手)それぞれで computeCoach() を7回計測して中央値を比較する
// (PLAN_v92_consistency.md v92b節「局終了時の追加時間を実測」)。
//
// 実行方法: node perf_v92b_coach_mc.js
// 事前条件: tests/index.html が最新のsrc/index.html(v92b)から生成済みであること(gen_test_index.js)。
//           v92aの比較用DOMは本スクリプトが os.tmpdir() に自動生成する。

const { buildDom, wait } = require("./harness.js");
const fs = require("fs");
const path = require("path");
const os = require("os");

function buildBeforeHtml() {
  const v92aPath = path.join(__dirname, "..", "..", "v92a", "src", "index.html");
  const v92aSrc = fs.readFileSync(v92aPath, "utf-8");
  const shim = fs.readFileSync(path.join(__dirname, "shim_block.txt"), "utf-8");
  const idx = v92aSrc.lastIndexOf("})();");
  if (idx < 0) throw new Error("})(); marker not found in v92a src");
  const out = v92aSrc.slice(0, idx) + shim + v92aSrc.slice(idx);
  const outPath = path.join(os.tmpdir(), "v92b_perf_before_index.html");
  fs.writeFileSync(outPath, out, "utf-8");
  return outPath;
}

// tierOpts(strong/coop)と同一の実対局最強AIオプション(v92b後のcomputeCoachと同一条件)。
// 局面構築(全席をこのAIで進行)には常にこれを使う — 実対局を模すため。
function strongOpts(seed) {
  return {mc: true, solver: true, mcDets: 96, mcSeed: seed, attackMC: true, matchEq: true,
          dd: true, ddLimit: 16, ddDets: 16, wSample: true, danger: true};
}

function playFullGame(G, seed, humanSeat) {
  const hands = G.dealOnce(G.mulberry32(seed));
  const parent = G.SEATS[seed % 4];
  const st = G.newGameState(hands, parent);
  const moves = [];
  let guard = 0;
  while (st.phase !== "over" && guard++ < 400) {
    const seat = st.actor;
    const a = G.policyAction(st, seat, strongOpts(seed + 1));
    if (!a) break;
    const ev = G.advance(st, {type: a.type, koma: a.koma || null});
    moves.push({seat, human: seat === humanSeat, action: {type: a.type, koma: a.koma || null}});
    if (ev && ev.gameOver) break;
  }
  return {gameNo: 1, matchNo: 1, parent, initialHands: hands,
          scoresBefore: {NS: 0, EW: 0}, moves, result: null};
}

function humanMoveCount(rec, seat) {
  return rec.moves.filter(m => m.seat === seat && m.human).length;
}

// computeCoachはmv.cfを一度書き込むと同じmoveを再計算しない(idempotent)ため、
// 計測の都度cf/forced/cfvを取り除いた新鮮なコピーを作る。
function freshRec(rec) {
  const clone = JSON.parse(JSON.stringify(rec));
  clone.moves.forEach(m => { delete m.cf; delete m.forced; });
  delete clone.cfv;
  return clone;
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function timeComputeCoach(computeCoachFn, rec, runs) {
  const times = [];
  for (let k = 0; k < runs; k++) {
    const r = freshRec(rec);
    const t0 = process.hrtime.bigint();
    computeCoachFn(r);
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1e6);   // ms
  }
  return times;
}

(async () => {
  const beforePath = buildBeforeHtml();
  const domAfter = buildDom();      // tests/index.html = v92b (src/index.html最新)
  const domBefore = buildDom(beforePath);   // v92a(変更前)
  await wait(300);
  const G = domAfter.window.__T.G;
  const Tbefore = domBefore.window.__T;
  const Tafter = domAfter.window.__T;

  const humanSeat = "S";
  // 人間手9〜11手のfixtureを複数(最大3件)集めてそれぞれ計測する(局面依存のばらつきを可視化するため)。
  const candidates = [];
  for (let seed = 1; seed <= 120 && candidates.length < 3; seed++) {
    const rec = playFullGame(G, seed, humanSeat);
    const n = humanMoveCount(rec, humanSeat);
    if (n >= 9) candidates.push({seed, n, rec});
  }
  if (!candidates.length) throw new Error("人間手9手以上のfixtureが見つからなかった(seed範囲を広げる必要あり)");

  const RUNS = 7;
  const rows = [];
  for (const c of candidates) {
    const bt = timeComputeCoach(Tbefore.computeCoach, c.rec, RUNS);
    const at = timeComputeCoach(Tafter.computeCoach, c.rec, RUNS);
    rows.push({seed: c.seed, n: c.n, total: c.rec.moves.length,
               bMed: median(bt), aMed: median(at), bt, at});
  }

  console.log(`RUNS=${RUNS}回/fixture、fixture数=${rows.length}(人間手9手以上)`);
  console.log("");
  for (const r of rows) {
    console.log(`seed=${r.seed} 人間手=${r.n} 総手数=${r.total}`);
    console.log(`  変更前(v92a): [${r.bt.map(t => t.toFixed(1)).join(", ")}] 中央値=${r.bMed.toFixed(1)}ms`);
    console.log(`  変更後(v92b): [${r.at.map(t => t.toFixed(1)).join(", ")}] 中央値=${r.aMed.toFixed(1)}ms`);
    console.log(`  差分: +${(r.aMed - r.bMed).toFixed(1)}ms`);
    console.log("");
  }
  const bMeds = rows.map(r => r.bMed), aMeds = rows.map(r => r.aMed);
  console.log(`全fixture中央値の中央値: 変更前=${median(bMeds).toFixed(1)}ms, 変更後=${median(aMeds).toFixed(1)}ms`);
  console.log(`全fixture中央値の最大値: 変更前=${Math.max(...bMeds).toFixed(1)}ms, 変更後=${Math.max(...aMeds).toFixed(1)}ms`);

  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
