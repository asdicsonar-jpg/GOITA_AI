// failbefore_v92c.js — test_v92c_engine.jsの主要フィクスチャを、修正前(v91bc)エンジンと
// 修正後(v92c)エンジンの両方に通し、「修正前は期待どおり失敗(旧挙動)し、修正後はPASSする」ことを
// 一覧表示する。IMPLEMENTATION_REPORT_v92c.mdのfail-before証跡として使用。
"use strict";
const fs = require("fs");
const { extractSlice } = require("./engine_extract.js");
const { loadEnginesFromFile, evalEngineText } = require("./load_engine.js");

const BEFORE = "/home/claude/work/goita/build/v91bc/src/index.html";
const AFTER = "/home/claude/work/goita/build/v92c/src/index.html";

function loadInstrumentedG(srcPath) {
  const src = fs.readFileSync(srcPath, "utf-8");
  const text = extractSlice(src, "G").text;
  const marker = "setKPairEv, pairAttackEvidence,";
  const instrumented = text.split(marker).join("setKPairEv, pairAttackEvidence, firstAtkEvidence,");
  return evalEngineText(instrumented, "G");
}

function runChecks(label, srcPath) {
  const { G, G_B } = loadEnginesFromFile(srcPath);
  const Gi = loadInstrumentedG(srcPath);
  G.setOuSignal(true); G_B.setOuSignal(true); Gi.setOuSignal(true);
  const out = [];

  // M-11(a-1): partnerSignaledShi context -> detectOuSignals should NOT flag
  {
    const prefix = [
      {seat: "N", act: "attack", koma: "し"}, {seat: "S", act: "attack", koma: "香"},
      {seat: "W", act: "attack", koma: "金"}, {seat: "E", act: "attack", koma: "銀"},
    ];
    const full = prefix.concat([{seat: "S", act: "attack", koma: "し"}]);
    out.push(["M-11 detectOuSignals(context)", JSON.stringify(G.detectOuSignals(full, "S")), "[] expected post-fix"]);
    out.push(["M-11 partnerSignaledOu(context)", String(G.partnerSignaledOu(full, "S")), "false expected post-fix"]);
    out.push(["M-11 inferPartnerHoldings(context)", JSON.stringify(G.inferPartnerHoldings(full, "S")), '{"し":4} (no 王) expected post-fix']);
  }
  // M-12(a)/(c): kakSet ac<=8 window + registration window
  {
    const hist1 = [
      {seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"},
      {seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"},
      {seat: "S", act: "attack", koma: "香"}, {seat: "N", act: "attack", koma: "香"},
    ];
    out.push(["M-12a inferPartnerHoldings[香](ac5 lead)", JSON.stringify(G.inferPartnerHoldings(hist1, "N")["香"]), "1 expected post-fix"]);
    const hist2 = [];
    for (let i = 0; i < 4; i++) hist2.push({seat: "W", act: "attack", koma: "飛"}, {seat: "E", act: "attack", koma: "角"});
    hist2.push({seat: "N", act: "attack", koma: "香"});
    out.push(["M-12c inferPartnerHoldings[香](ac9)", JSON.stringify(G.inferPartnerHoldings(hist2, "N")["香"]), "undefined expected post-fix"]);
    const ev = Gi.firstAtkEvidence({seat: "X", hist: hist1});
    const nEv = ev.find(e => e.seat === "N" && e.koma === "香");
    out.push(["M-12b firstAtkEvidence.kc(N,香)", String(nEv && nEv.kc), "true expected post-fix"]);
  }
  // M-13: G_B damashi-kyou
  {
    function buildDeal() {
      return {
        S: ["王", "王", "香", "し", "し", "し", "し", "金"],
        N: ["飛", "飛", "角", "角", "金", "金", "金", "銀"],
        W: ["銀", "銀", "銀", "馬", "馬", "馬", "馬", "香"],
        E: ["香", "香", "し", "し", "し", "し", "し", "し"],
      };
    }
    for (const coop of [false, true]) {
      G_B.setCoopSignal(coop);
      const st = G_B.newGameState(buildDeal(), "S");
      G_B.advance(st, {type: "bury", koma: "金"});
      const a = G_B.policyAction(st, "S", {mc: false, solver: false});
      out.push([`M-13 G_B.policyAction(coop=${coop})`, JSON.stringify(a.koma), 'not "香" expected post-fix']);
    }
  }

  console.log(`\n=== ${label} (${srcPath}) ===`);
  for (const [name, actual, note] of out) console.log(`  ${name.padEnd(45)} actual=${String(actual).padEnd(20)} (${note})`);
  return out;
}

runChecks("BEFORE (v91bc baseline, pre-M11/M12/M13)", BEFORE);
runChecks("AFTER  (v92c, post-M11/M12/M13)", AFTER);
