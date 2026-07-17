// engine_extract.js — G / G_B を波括弧深度で機械抽出するユーティリティ (extract_sha.js のロジックを
// 抽出開始/終了オフセット付きで再利用できる形に分離。v92c patches.js / build_variants.js / apply_v92c.js が共有)。
"use strict";

function extractByBraceDepth(src, startIdx) {
  let i = src.indexOf("{", startIdx);
  if (i < 0) throw new Error("no opening brace found from " + startIdx);
  const begin = startIdx;
  let depth = 0;
  let inStr = null;
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
  let end = i;
  const tail = src.slice(end, end + 6);
  const m = tail.match(/^\)\(\);?/);
  if (m) end += m[0].length;
  return { begin, end, text: src.slice(begin, end) };
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

// スライス抽出: {begin, end, text} を返す(begin/endはsrc内のオフセット、endは")();"含む末尾直後)
function extractSlice(src, label) {
  const startIdx = findStart(src, label);
  return extractByBraceDepth(src, startIdx);
}

module.exports = { extractByBraceDepth, findStart, extractSlice };
