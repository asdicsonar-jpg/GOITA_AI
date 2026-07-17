// byte-exact検証用: G / G_B / saveCareerToStorage / loadCareerFromStorage を
// 波括弧深度で機械抽出しsha256を算出する。文字列・テンプレートリテラル・コメント内の
// 波括弧を深度カウントから除外する簡易トークナイザを内蔵。
// 使い方: node extract_sha.js <index.htmlのパス>
const fs = require("fs");
const crypto = require("crypto");

function extractByBraceDepth(src, startIdx) {
  // startIdx: 宣言の先頭("const G = "などの"c"や"function"の"f")
  // 最初の"{"まで進めてから深度カウントを開始する。
  let i = src.indexOf("{", startIdx);
  if (i < 0) throw new Error("no opening brace found from " + startIdx);
  const begin = startIdx;
  let depth = 0;
  let inStr = null;   // '"', "'", '`', or null
  let inLineComment = false;
  let inBlockComment = false;
  for (; i < src.length; i++) {
    const c = src[i];
    const prev = src[i - 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (prev === "*" && c === "/") inBlockComment = false;
      continue;
    }
    if (inStr) {
      if (c === "\\" && prev !== "\\") { /* escape next char; simplistic: just skip via next iter check */ }
      if (c === inStr && prev !== "\\") inStr = null;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") { inLineComment = true; continue; }
    if (c === "/" && src[i + 1] === "*") { inBlockComment = true; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  // 末尾に続く ")();" 等(IIFE呼び出し)があれば含める(Gの場合)
  let end = i;
  const tail = src.slice(end, end + 6);
  const m = tail.match(/^\)\(\);?/);
  if (m) end += m[0].length;
  return src.slice(begin, end);
}

function findStart(src, label) {
  let re;
  if (label === "G") re = /(?<![A-Za-z_])const G = \(\(\) => \{/;
  else if (label === "G_B") re = /(?<![A-Za-z_])const G_B = \(\(\) => \{/;
  else if (label === "saveCareerToStorage") re = /function saveCareerToStorage\(\)\s*\{/;
  else if (label === "loadCareerFromStorage") re = /function loadCareerFromStorage\(\)\s*\{/;
  else throw new Error("unknown label " + label);
  const m = re.exec(src);
  if (!m) throw new Error("declaration not found: " + label);
  return m.index;
}

function main() {
  const path = process.argv[2];
  if (!path) { console.error("usage: node extract_sha.js <index.html>"); process.exit(1); }
  const src = fs.readFileSync(path, "utf-8");
  const labels = ["G", "G_B", "saveCareerToStorage", "loadCareerFromStorage"];
  const out = {};
  for (const label of labels) {
    const startIdx = findStart(src, label);
    const snippet = extractByBraceDepth(src, startIdx);
    const sha = crypto.createHash("sha256").update(snippet, "utf-8").digest("hex");
    out[label] = {sha256: sha, len: snippet.length};
  }
  for (const label of labels) {
    console.log(label + "\t" + out[label].sha256 + "\t(" + out[label].len + " bytes)");
  }
}
main();
