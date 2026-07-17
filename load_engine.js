// load_engine.js — index.html から G / G_B を波括弧深度で抽出し、jsdom無しでNodeモジュールとして
// ロードする(DOM/グローバル参照ゼロの純粋JSであることを利用)。エンジン単体テストとA/Bハーネスの両方が
// 使う軽量ローダ。
"use strict";
const fs = require("fs");
const { extractSlice } = require("./engine_extract.js");

// text: "const G = (() => { ... })();" 形式の完全な文。そのまま評価してG(またはG_B)を取り出す。
function evalEngineText(text, exportName) {
  const mod = { exports: {} };
  const fn = new Function("module", "exports", text + "\nmodule.exports = " + exportName + ";");
  fn(mod, mod.exports);
  return mod.exports;
}

// srcPath(index.htmlのパス)からG/G_Bを両方ロードする。
function loadEnginesFromFile(srcPath) {
  const src = fs.readFileSync(srcPath, "utf-8");
  const G = evalEngineText(extractSlice(src, "G").text, "G");
  const G_B = evalEngineText(extractSlice(src, "G_B").text, "G_B");
  return { G, G_B };
}

// テキスト(既にextractSlice済みのG/G_Bスライス文字列)から単体をロードする(build_variants.js用)。
function loadEngineFromText(text, exportName) {
  return evalEngineText(text, exportName);
}

module.exports = { evalEngineText, loadEnginesFromFile, loadEngineFromText };
