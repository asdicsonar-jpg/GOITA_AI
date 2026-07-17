// apply_v92c.js — v92c M-11/M-12/M-13パッチを実ファイル(src/index.html)に適用する。
// patches.js の同一定義を使うため、後続の build_variants.js の「無ガード保証」と
// 意味的に同一の変換であることが保証される。
"use strict";
const fs = require("fs");
const crypto = require("crypto");
const { extractSlice } = require("./engine_extract.js");
const { applyPatchList, M11_PATCHES, M12_PATCHES, M13_PATCH } = require("./patches.js");

const target = process.argv[2];
if (!target) { console.error("usage: node apply_v92c.js <index.htmlのパス>"); process.exit(1); }

const src = fs.readFileSync(target, "utf-8");
const sha = t => crypto.createHash("sha256").update(t, "utf-8").digest("hex");

const gSlice = extractSlice(src, "G");
const gbSlice = extractSlice(src, "G_B");
if (gbSlice.begin < gSlice.end) throw new Error("unexpected ordering: G_B before end of G");

console.log("BEFORE G    sha256=" + sha(gSlice.text));
console.log("BEFORE G_B  sha256=" + sha(gbSlice.text));

const gNew = applyPatchList(gSlice.text, [...M11_PATCHES, ...M12_PATCHES], 1);
const gbNew = applyPatchList(gbSlice.text, [...M11_PATCHES, ...M12_PATCHES, M13_PATCH], 1);

console.log("AFTER  G    sha256=" + sha(gNew));
console.log("AFTER  G_B  sha256=" + sha(gbNew));

// 再構成: [0,gSlice.begin) + gNew + [gSlice.end, gbSlice.begin) + gbNew + [gbSlice.end, end)
const out =
  src.slice(0, gSlice.begin) + gNew +
  src.slice(gSlice.end, gbSlice.begin) + gbNew +
  src.slice(gbSlice.end);

fs.writeFileSync(target, out, "utf-8");
console.log("written: " + target + " (" + out.length + " bytes, was " + src.length + ")");
