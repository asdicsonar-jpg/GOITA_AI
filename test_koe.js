// test_koe.js — v90.4 掛け声(kf-koe)演出の検証。PLAN_v90_4_kiriko_koe.md 検証計画(a)〜(g)。
const { buildDom, wait } = require("./harness.js");
const assert = require("assert");

async function run() {
  const results = [];
  function ok(name, cond, detail) {
    results.push({ name, pass: !!cond, detail });
  }

  const dom = buildDom();
  const { window } = dom;
  await wait(50);
  const T = window.__T;
  if (!T) throw new Error("harness shim (window.__T) failed to load");
  const app = T.app;

  // 共通セットアップ: 対局中扱い(humanSeat)にしてnotoAccentをONにする
  app.humanSeat = "S";
  app.cfg = app.cfg || {};
  app.cfg.notoAccent = true;
  app.cfg.fxLen = "full";
  window.document.body.classList.add("noto");

  function countKoe() {
    const stage = window.document.getElementById("kiriko-fire");
    if (!stage) return 0;
    return stage.querySelectorAll(".kf-koe").length;
  }
  function koeTexts() {
    const stage = window.document.getElementById("kiriko-fire");
    if (!stage) return [];
    return Array.prototype.slice.call(stage.querySelectorAll(".kf-koe")).map((e) => e.textContent);
  }

  // --- (a) noto ON・full・45点(tier n=2) → .kf-koe 2個、テキスト確認 ---
  {
    app.cfg.fxLen = "full";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 45, dbl: false, draw: false });
    const n = countKoe();
    const texts = koeTexts();
    ok("(a) tier45: kf-koe count === 2", n === 2, "got " + n);
    ok(
      "(a) tier45: texts are ＼イヤサカヨッセ／ and ＼サカヨッセ／",
      texts.includes("＼イヤサカヨッセ／") && texts.includes("＼サカヨッセ／"),
      JSON.stringify(texts)
    );
  }

  // --- (b) 65点(tier3,n=6) → 4個(飽和上限)。55点(tier2,n=4) → 3個 ---
  {
    app.cfg.fxLen = "full";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 65, dbl: false, draw: false });
    const n65 = countKoe();
    ok("(b) tier65: kf-koe count === 4", n65 === 4, "got " + n65);

    T.kirikoBurn({ winner: "S", koma: "王", pts: 55, dbl: false, draw: false });
    const n55 = countKoe();
    ok("(b) tier55: kf-koe count === 3", n55 === 3, "got " + n55);
  }

  // --- (c) notoAccent OFF(body.notoなし) → stage空(0個) ---
  {
    window.document.body.classList.remove("noto");
    app.cfg.fxLen = "full";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 65, dbl: false, draw: false });
    const stage = window.document.getElementById("kiriko-fire");
    const n = countKoe();
    ok("(c) notoAccent OFF: kf-koe count === 0", n === 0, "got " + n);
    ok(
      "(c) notoAccent OFF: stage not populated (no .kf-blaze either)",
      !stage || stage.querySelectorAll(".kf-blaze").length === 0,
      stage ? stage.innerHTML.length : "no stage"
    );
    window.document.body.classList.add("noto"); // restore
  }

  // --- (d) fxLen=min → 0個(構造ゲート継承の証明) ---
  {
    app.cfg.fxLen = "min";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 65, dbl: false, draw: false });
    const n = countKoe();
    ok("(d) fxLen=min: kf-koe count === 0", n === 0, "got " + n);
    app.cfg.fxLen = "full"; // restore
  }

  // --- (e) kirikoRelease(true) → 0個(清掃の相乗り確認) ---
  {
    app.cfg.fxLen = "full";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 65, dbl: false, draw: false });
    const before = countKoe();
    T.kirikoRelease(true);
    const after = countKoe();
    ok("(e) before release: kf-koe count > 0", before > 0, "got " + before);
    ok("(e) after kirikoRelease(true): kf-koe count === 0", after === 0, "got " + after);
  }

  // --- (f) 廃止の機械証明: Math.randomを0固定してshowWinCutを実行し、
  //     .wc-sub に「イヤサカヨッセ」が含まれないこと・「席・駒」表記であること ---
  {
    const origRandom = Math.random;
    Math.random = () => 0;
    try {
      T.showWinCut({ winner: "S", koma: "王", pts: 50, dbl: false, draw: false, recvFinish: false });
      const el = window.document.getElementById("wincut");
      const sub = el ? el.querySelector(".wc-sub") : null;
      const subText = sub ? sub.textContent : "";
      ok(
        "(f) wc-sub does NOT contain イヤサカヨッセ",
        !subText.includes("イヤサカヨッセ"),
        JSON.stringify(subText)
      );
      const seatWord = T.seatDisp ? T.seatDisp("S") || "S" : "S";
      const expected = seatWord + "・王";
      ok(
        "(f) wc-sub shows 席・駒 format (" + expected + ")",
        subText === expected,
        JSON.stringify(subText) + " expected " + JSON.stringify(expected)
      );
    } finally {
      Math.random = origRandom;
    }
  }

  // --- (g) short(cap1) → tier1キリコ + kf-koe 2個 ---
  {
    app.cfg.fxLen = "short";
    T.kirikoBurn({ winner: "S", koma: "王", pts: 65, dbl: false, draw: false });
    const n = countKoe();
    ok("(g) short preset: kf-koe count === 2 (tier capped to 1)", n === 2, "got " + n);
    app.cfg.fxLen = "full"; // restore
  }

  // --- report ---
  let failCount = 0;
  for (const r of results) {
    console.log((r.pass ? "PASS" : "FAIL") + " - " + r.name + (r.pass ? "" : " (" + r.detail + ")"));
    if (!r.pass) failCount++;
  }
  console.log("---");
  console.log(results.length + " assertions, " + (results.length - failCount) + " passed, " + failCount + " failed");
  console.log("jsdom internal errors: " + JSON.stringify(dom._errors.map(String)));
  if (failCount > 0 || dom._errors.length > 0) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
