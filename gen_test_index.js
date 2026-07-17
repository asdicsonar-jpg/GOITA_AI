// テスト用index.htmlを生成する: src/index.html の末尾IIFE内(})();の直前)に
// shim_block.txt を挿入したコピーを tests/index.html として書き出す。
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "index.html");
const SHIM = path.join(__dirname, "shim_block.txt");
const OUT = path.join(__dirname, "index.html");

const html = fs.readFileSync(SRC, "utf-8");
const shim = fs.readFileSync(SHIM, "utf-8");

// 最後の "})();" を探す(4番目のscriptブロック末尾のIIFE終端)
const idx = html.lastIndexOf("})();");
if (idx < 0) throw new Error("})(); not found");
const out = html.slice(0, idx) + shim + html.slice(idx);
fs.writeFileSync(OUT, out, "utf-8");
console.log("wrote " + OUT + " (" + out.length + " bytes)");
