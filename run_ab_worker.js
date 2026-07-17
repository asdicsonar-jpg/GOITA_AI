// run_ab_worker.js — child_process.fork()されるワーカー。親からのメッセージで担当する
// dealIndices配列を受け取り、playPairを実行して結果配列をIPCで返す。
"use strict";
const path = require("path");
const { playPair } = require("./play_pair.js");

function loadVariant(filePath, coopSignal) {
  delete require.cache[require.resolve(filePath)];
  const mod = require(filePath);
  if (typeof mod.setOuSignal === "function") mod.setOuSignal(true);   // ハーネス既定: 全変種にouSignal明示
  if (coopSignal != null && typeof mod.setCoopSignal === "function") mod.setCoopSignal(!!coopSignal);
  return mod;
}

// このワーカーは親プロセスの生存期間中、複数のjobメッセージを繰り返し処理する(1メッセージごとに
// 終了してはならない — かつてのバグ: process.exit(0)を都度呼んでいたため2シャード目以降が
// 永久に応答を返さず、親のPromise.allがハングしたままNodeがイベントループを空と判断して
// 静かに終了してしまっていた)。終了は親からのworker.kill()に委ねる。
// require.cacheのモジュールは変種ファイルごとに1回だけロードしメモ化する(setOuSignal等の
// mulberry32状態は決定的なmcSeed注入のみに依存するため、モジュールを使い回して問題ない)。
const loadedCache = new Map();
function loadVariantCached(filePath, coopSignal) {
  const resolved = path.resolve(filePath);
  let mod = loadedCache.get(resolved);
  if (!mod) {
    mod = require(resolved);
    loadedCache.set(resolved, mod);
  }
  if (typeof mod.setOuSignal === "function") mod.setOuSignal(true);
  if (coopSignal != null && typeof mod.setCoopSignal === "function") mod.setCoopSignal(!!coopSignal);
  return mod;
}

process.on("message", job => {
  try {
    const variantX = loadVariantCached(job.variantXFile, job.xCoopSignal);
    const baseline = loadVariantCached(job.baselineFile, job.baselineCoopSignal);
    const refG = loadVariantCached(job.refGFile, null);

    const results = [];
    for (const dealIndex of job.dealIndices) {
      try {
        const r = playPair(refG, dealIndex, variantX, baseline);
        results.push(r);
      } catch (e) {
        results.push({ dealIndex, skip: true, reason: "error", error: String(e && e.stack || e) });
      }
    }
    process.send({ ok: true, results });
  } catch (e) {
    process.send({ ok: false, error: String(e && e.stack || e) });
  }
});
