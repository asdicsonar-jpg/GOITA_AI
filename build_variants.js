// build_variants.js — v92c A/B検証用のソースレベルのエンジン変種を構築する。
// G_base/B_base: v91bc(修正前・承認済み)から抽出。
// G_full/B_full: v92c(修正後の実ファイル)から抽出。
// G_m11/G_m12: G_baseにM-11のみ/M-12のみを適用(帰属試験用)。
// 「無ガード保証」: G_base+M11+M12 が G_full と文字列完全一致することをassertする(B側も同様)。
// これにより「計測した変種がそのまま出荷物であることの機械証明」が成立する。
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { extractSlice } = require("./engine_extract.js");
const { applyPatchList, M11_PATCHES, M12_PATCHES, M13_PATCH } = require("./patches.js");

const BASE_SRC = "/home/claude/work/goita/build/v91bc/src/index.html";
const FULL_SRC = "/home/claude/work/goita/build/v92c/src/index.html";
const OUT_DIR = path.join(__dirname, "variants");

const sha = t => crypto.createHash("sha256").update(t, "utf-8").digest("hex");

function asModule(text, exportName) {
  return text + "\nmodule.exports = " + exportName + ";\n";
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseSrc = fs.readFileSync(BASE_SRC, "utf-8");
  const fullSrc = fs.readFileSync(FULL_SRC, "utf-8");

  const gBase = extractSlice(baseSrc, "G").text;
  const bBase = extractSlice(baseSrc, "G_B").text;
  const gFull = extractSlice(fullSrc, "G").text;
  const bFull = extractSlice(fullSrc, "G_B").text;

  // 帰属用の単独パッチ変種(M-11のみ / M-12のみ)。いずれもG_baseに対して1回ずつ適用。
  const gM11 = applyPatchList(gBase, M11_PATCHES, 1);
  const gM12 = applyPatchList(gBase, M12_PATCHES, 1);

  // 無ガード保証: G_base + M11 + M12 (この順) === G_full (実ファイルから抽出)
  const gDerivedFull = applyPatchList(gBase, [...M11_PATCHES, ...M12_PATCHES], 1);
  if (gDerivedFull !== gFull) {
    throw new Error("無ガード保証(G)失敗: G_base+M11+M12 が実ファイルのG_fullと一致しない");
  }
  // B側: B_base + M11 + M12 + M13 === B_full
  const bDerivedFull = applyPatchList(bBase, [...M11_PATCHES, ...M12_PATCHES, M13_PATCH], 1);
  if (bDerivedFull !== bFull) {
    throw new Error("無ガード保証(G_B)失敗: B_base+M11+M12+M13 が実ファイルのB_fullと一致しない");
  }

  const variants = {
    G_base: { text: gBase, exportName: "G" },
    G_full: { text: gFull, exportName: "G" },
    G_m11: { text: gM11, exportName: "G" },
    G_m12: { text: gM12, exportName: "G" },
    B_base: { text: bBase, exportName: "G_B" },
    B_full: { text: bFull, exportName: "G_B" },
  };

  const shaTable = {};
  for (const [name, v] of Object.entries(variants)) {
    const outPath = path.join(OUT_DIR, name + ".js");
    fs.writeFileSync(outPath, asModule(v.text, v.exportName), "utf-8");
    shaTable[name] = sha(v.text);
    // syntax check
    new Function(v.text);
  }

  fs.writeFileSync(path.join(OUT_DIR, "sha256.json"), JSON.stringify(shaTable, null, 2) + "\n", "utf-8");

  console.log("無ガード保証: G_base+M11+M12 === G_full : OK");
  console.log("無ガード保証: B_base+M11+M12+M13 === B_full : OK");
  console.log("\nvariant sha256:");
  for (const [name, s] of Object.entries(shaTable)) console.log("  " + name.padEnd(8) + s);
  console.log("\nwritten to " + OUT_DIR);
}

main();
