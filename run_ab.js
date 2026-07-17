// run_ab.js — v92c A/B検証プロトコルのオーケストレータ。
// 実行メニュー(計画どおりの順序):
//   1) サニティ: G_base vs G_base, 300ペア (総和が厳密に0)
//   2) 本命: G_full vs G_base, 2500ペア
//   3) 帰属: G_m11 vs G_base, G_m12 vs G_base, 各2000ペア
//   4) M-13: B_full(coop on) vs G_base と B_base(coop on) vs G_base を各2000ペア(同一シード列)、
//      ペア差 d_i = net(B_full) - net(B_base) で評価
// 結果はtests/ab/results/<name>.json に保存(中断・再開可能: シャードごとにキャッシュファイルを
// 使い、既に完了したシャードは再実行しない)。
"use strict";
const fs = require("fs");
const path = require("path");
const { fork } = require("child_process");
const { buildDealForIndex, dealIsPlayable } = require("./play_pair.js");

const VARIANTS_DIR = path.join(__dirname, "variants");
const RESULTS_DIR = path.join(__dirname, "results");
const REF_G_FILE = path.join(VARIANTS_DIR, "G_base.js");
const N_WORKERS = Number(process.env.AB_WORKERS || 8);
const SHARD_SIZE = Number(process.env.AB_SHARD_SIZE || 50);   // ペア数/シャード

fs.mkdirSync(RESULTS_DIR, { recursive: true });

function loadRefGForSelection() {
  delete require.cache[require.resolve(REF_G_FILE)];
  const G = require(REF_G_FILE);
  G.setOuSignal(true);
  return G;
}

// [offsetStart, offsetStart+scanCap) の範囲を順に走査し、count件のプレイ可能なdealIndexを選ぶ。
function selectValidDealIndices(refG, offsetStart, count, scanCap) {
  const out = [];
  let i = offsetStart;
  const cap = offsetStart + (scanCap || count * 3 + 1000);
  while (out.length < count && i < cap) {
    const { deal, parent } = buildDealForIndex(refG, i);
    if (dealIsPlayable(refG, deal, parent).ok) out.push(i);
    i++;
  }
  if (out.length < count) throw new Error(`selectValidDealIndices: only found ${out.length}/${count} in range`);
  return out;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// N_WORKERS並列でシャードを処理(プールを維持し、シャードを使い切るまで再利用する)。
// キャッシュ: results/_shardcache/<expName>_<shardIdx>.json が既にあればスキップして読み込む。
async function runShardedExperiment(expName, shards, variantXFile, baselineFile, xCoopSignal, baselineCoopSignal) {
  const cacheDir = path.join(RESULTS_DIR, "_shardcache");
  fs.mkdirSync(cacheDir, { recursive: true });

  const shardResults = new Array(shards.length);
  const pending = shards.map((dealIndices, idx) => ({ idx, dealIndices }))
    .filter(({ idx }) => {
      const cacheFile = path.join(cacheDir, `${expName}_${idx}.json`);
      if (fs.existsSync(cacheFile)) {
        shardResults[idx] = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        return false;
      }
      return true;
    });

  console.log(`[${expName}] ${shards.length} shards total, ${shards.length - pending.length} cached, ${pending.length} to run`);

  let cursor = 0;
  let completed = 0;
  const total = pending.length;

  function runOne(worker, job) {
    return new Promise((resolve, reject) => {
      worker.removeAllListeners("message");
      worker.once("message", msg => {
        if (!msg.ok) reject(new Error(msg.error));
        else resolve(msg.results);
      });
      worker.send(job);
    });
  }

  const workers = [];
  for (let w = 0; w < N_WORKERS; w++) workers.push(fork(path.join(__dirname, "run_ab_worker.js")));

  try {
    await Promise.all(workers.map(async worker => {
      while (cursor < pending.length) {
        const my = pending[cursor++];
        const job = {
          variantXFile, baselineFile, refGFile: REF_G_FILE,
          xCoopSignal, baselineCoopSignal,
          dealIndices: my.dealIndices,
        };
        const results = await runOne(worker, job);
        shardResults[my.idx] = results;
        fs.writeFileSync(path.join(cacheDir, `${expName}_${my.idx}.json`), JSON.stringify(results));
        completed++;
        if (completed % 10 === 0 || completed === total) {
          console.log(`[${expName}] shard ${completed}/${total} done`);
        }
      }
    }));
  } finally {
    for (const w of workers) w.kill();
  }

  return shardResults.flat();
}

function summarize(results) {
  const played = results.filter(r => !r.skip);
  const ds = played.map(r => r.d);
  const n = ds.length;
  const sum = ds.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : 0;
  const variance = n > 1 ? ds.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
  const sd = Math.sqrt(variance);
  const se = n ? sd / Math.sqrt(n) : 0;
  const wins = played.filter(r => r.d > 0).length;
  const losses = played.filter(r => r.d < 0).length;
  const ties = played.filter(r => r.d === 0).length;
  const skipped = results.length - played.length;
  return { n, sum, mean, sd, se, winRate: n ? wins / n : 0, wins, losses, ties, skipped, requested: results.length };
}

async function runExperiment(name, variantIndices, variantXFile, baselineFile, opts) {
  opts = opts || {};
  const outFile = path.join(RESULTS_DIR, name + ".json");
  if (fs.existsSync(outFile)) {
    console.log(`[${name}] result file already exists, loading cached final result`);
    return JSON.parse(fs.readFileSync(outFile, "utf-8"));
  }
  const shards = chunk(variantIndices, SHARD_SIZE);
  const results = await runShardedExperiment(name, shards, variantXFile, baselineFile,
    opts.xCoopSignal, opts.baselineCoopSignal);
  const summary = summarize(results);
  const out = { name, summary, results };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  console.log(`[${name}] DONE n=${summary.n} mean=${summary.mean.toFixed(3)} se=${summary.se.toFixed(3)} winRate=${(summary.winRate * 100).toFixed(1)}% sum=${summary.sum}`);
  return out;
}

async function main() {
  const refG = loadRefGForSelection();

  const G_base = path.join(VARIANTS_DIR, "G_base.js");
  const G_full = path.join(VARIANTS_DIR, "G_full.js");
  const G_m11 = path.join(VARIANTS_DIR, "G_m11.js");
  const G_m12 = path.join(VARIANTS_DIR, "G_m12.js");
  const B_base = path.join(VARIANTS_DIR, "B_base.js");
  const B_full = path.join(VARIANTS_DIR, "B_full.js");

  // 1) サニティ: G_base vs G_base, 300ペア (offset 0)
  const sanityIdx = selectValidDealIndices(refG, 0, 300);
  await runExperiment("1_sanity_Gbase_vs_Gbase", sanityIdx, G_base, G_base, {});

  // 2) 本命: G_full vs G_base, 2500ペア (offset 200000)
  const mainIdx = selectValidDealIndices(refG, 200000, 2500);
  await runExperiment("2_main_Gfull_vs_Gbase", mainIdx, G_full, G_base, {});

  // 3) 帰属: G_m11 vs G_base, G_m12 vs G_base, 各2000ペア (offset 400000 / 500000)
  const m11Idx = selectValidDealIndices(refG, 400000, 2000);
  await runExperiment("3a_attrib_Gm11_vs_Gbase", m11Idx, G_m11, G_base, {});

  const m12Idx = selectValidDealIndices(refG, 500000, 2000);
  await runExperiment("3b_attrib_Gm12_vs_Gbase", m12Idx, G_m12, G_base, {});

  // 4) M-13: B_full(coop on) vs G_base と B_base(coop on) vs G_base、同一シード列2000ペア (offset 700000)
  const m13Idx = selectValidDealIndices(refG, 700000, 2000);
  const bFullRes = await runExperiment("4a_m13_Bfull_vs_Gbase", m13Idx, B_full, G_base, { xCoopSignal: true });
  const bBaseRes = await runExperiment("4b_m13_Bbase_vs_Gbase", m13Idx, B_base, G_base, { xCoopSignal: true });

  // M-13のペア差評価: d_i = net(B_full)[deal] - net(B_base)[deal] (同一dealIndexで対応付け)
  const mapByDeal = arr => { const m = new Map(); for (const r of arr) if (!r.skip) m.set(r.dealIndex, r.d); return m; };
  const mFull = mapByDeal(bFullRes.results);
  const mBase = mapByDeal(bBaseRes.results);
  const diffs = [];
  for (const [dealIndex, dFull] of mFull) {
    if (mBase.has(dealIndex)) diffs.push(dFull - mBase.get(dealIndex));
  }
  const n = diffs.length;
  const mean = diffs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? diffs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1) : 0;
  const se = Math.sqrt(variance) / Math.sqrt(n);
  const wins = diffs.filter(d => d > 0).length;
  const m13Summary = { n, mean, se, winRate: wins / n, wins, losses: diffs.filter(d => d < 0).length, ties: diffs.filter(d => d === 0).length };
  fs.writeFileSync(path.join(RESULTS_DIR, "4c_m13_paired_diff.json"), JSON.stringify({ summary: m13Summary, diffs }, null, 1));
  console.log(`[4c_m13_paired_diff] n=${n} mean=${mean.toFixed(3)} se=${se.toFixed(3)} winRate=${(m13Summary.winRate * 100).toFixed(1)}%`);

  console.log("\n=== ALL A/B EXPERIMENTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL", e); process.exit(1); });
