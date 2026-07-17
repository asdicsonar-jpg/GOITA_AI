// patches.js — v92c M-11/M-12/M-13の厳密な old→new 文字列置換の集合。
// このファイルは (1) 実ファイル(src/index.html)へのパッチ適用スクリプト apply_v92c.js と
// (2) A/B検証用の変種構築 build_variants.js の両方から re-use される「単一の真実源」。
// 各パッチは「1エンジンコピー(G単体、またはG_B単体、またはB_base単体)のテキストに対して
// ちょうど1回だけマッチする」ことを前提に設計されている。フル ファイル(G+G_B両方を含む)に対して
// 適用する場合は expectedCount=2 を渡すこと(engine_extract.js のスライス単体に適用する場合は1)。
"use strict";

function applyPatch(text, patch, expectedCount) {
  const parts = text.split(patch.old);
  const count = parts.length - 1;
  if (count !== expectedCount) {
    throw new Error(
      `patch count mismatch for "${patch.name}": expected ${expectedCount}, got ${count}`
    );
  }
  return parts.join(patch.new);
}

// 順序どおりに適用する(何本かは前段の変換に依存する箇所があるため、配列の順序を厳守する)
function applyPatchList(text, patches, expectedCountEach) {
  let out = text;
  for (const p of patches) out = applyPatch(out, p, expectedCountEach);
  return out;
}

/* ===================== M-11: 王合図の読み手3系統に文脈ガードを追加 =====================
 * 送り手(attackChoice内「王持ち合図のし」)は !shiStarted(hist,seat) && !partnerSignaledShi(hist,seat)
 * を条件に持つが、読み手(detectOuSignals/partnerSignaledOu/inferPartnerHoldingsのouCtx)には
 * 文脈除外がなかった。候補時点のhist接頭辞(hist.slice(0,i))に対して同じ2ヘルパーを呼び対称化する。
 */
const M11_PATCHES = [
  {
    name: "M11-1-detectOuSignals",
    old: `      if (h.koma === "し") {
        if (pShiShown < 2 &&
            ((ac > 8 && ac <= 12 && pFirst !== "し") ||
             (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4))) out.push(i);
        pShiShown++;
      }
    }
    return out;
  }
  function firstAttackKyouR1(hist, seat) {`,
    new: `      if (h.koma === "し") {
        if (pShiShown < 2 &&
            ((ac > 8 && ac <= 12 && pFirst !== "し") ||
             (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4)) &&
            !(shiStarted(hist.slice(0, i), seat) || partnerSignaledShi(hist.slice(0, i), seat)))   // M-11: し攻め文脈中は王合図と読まない(送り手と対称)
          out.push(i);
        pShiShown++;
      }
    }
    return out;
  }
  function firstAttackKyouR1(hist, seat) {`,
  },
  {
    name: "M11-2a-partnerSignaledOu-loop",
    old: `    let ac = 0, pFirst = null, pFirstAc = 0, sig = false, pShiShown = 0;
    for (const h of hist) {
      if (h.seat === partner && h.act === "receive" && h.koma === "し") pShiShown++;`,
    new: `    let ac = 0, pFirst = null, pFirstAc = 0, sig = false, pShiShown = 0;
    for (let _oi = 0; _oi < hist.length; _oi++) {
      const h = hist[_oi];
      if (h.seat === partner && h.act === "receive" && h.koma === "し") pShiShown++;`,
  },
  {
    name: "M11-2b-partnerSignaledOu-guard",
    old: `      if (h.koma === "し") {
        // し余りの懐疑: この時点までに既にし2枚以上を見せていれば合図と読まない
        if (pShiShown < 2) {
          if (ac > 8 && ac <= 12 && pFirst !== "し") sig = true;
          else if (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4) sig = true;
        }
        pShiShown++;
      }
    }
    return sig;
  }`,
    new: `      if (h.koma === "し") {
        // し余りの懐疑: この時点までに既にし2枚以上を見せていれば合図と読まない
        // M-11: し攻め文脈中(shiStarted/partnerSignaledShi)は王合図と読まない(送り手と対称)
        if (pShiShown < 2 && !(shiStarted(hist.slice(0, _oi), partner) || partnerSignaledShi(hist.slice(0, _oi), partner))) {
          if (ac > 8 && ac <= 12 && pFirst !== "し") sig = true;
          else if (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4) sig = true;
        }
        pShiShown++;
      }
    }
    return sig;
  }`,
  },
  {
    name: "M11-3a-inferPartnerHoldings-loop",
    old: `    const kakSet = new Set(), me = partnerOf(partner); // かかり応え文脈検出(2026-07-03)
    for (const h of hist) {
      if (h.seat === partner && h.act === "receive" && h.koma === "し") pShiShown++;`,
    new: `    const kakSet = new Set(), me = partnerOf(partner); // かかり応え文脈検出(2026-07-03)
    for (let _hi = 0; _hi < hist.length; _hi++) {
      const h = hist[_hi];
      if (h.seat === partner && h.act === "receive" && h.koma === "し") pShiShown++;`,
  },
  {
    name: "M11-3b-inferPartnerHoldings-guard",
    old: `      else if (k === "し") {
        // 打ち止めのし文脈では「し4枚」と誤読しない。ただしし余り(既にし2枚以上可視)は合図と読まない
        const ouCtx = ouOn(partner) && ouTrust(partner) >= TRUST_READ && pShiShown < 2 &&
          ((ac > 8 && ac <= 12 && pFirst !== "し") ||
           (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4));
        if (ouCtx) inf["王"] = Math.max(inf["王"] || 0, 1);`,
    new: `      else if (k === "し") {
        // 打ち止めのし文脈では「し4枚」と誤読しない。ただしし余り(既にし2枚以上可視)は合図と読まない
        // M-11: し攻め文脈中(shiStarted/partnerSignaledShi)は王合図と読まない(送り手と対称)
        const ouCtx = ouOn(partner) && ouTrust(partner) >= TRUST_READ && pShiShown < 2 &&
          ((ac > 8 && ac <= 12 && pFirst !== "し") ||
           (ac > 4 && ac <= 8 && pFirst === "香" && pFirstAc <= 4)) &&
          !(shiStarted(hist.slice(0, _hi), partner) || partnerSignaledShi(hist.slice(0, _hi), partner));
        if (ouCtx) inf["王"] = Math.max(inf["王"] || 0, 1);`,
  },
];

/* ===================== M-12: 香のかかり文脈窓の対称化 (ac<=4 → 香のみac<=8) =====================
 * kakariGotae(香応え窓ac<=8)・detectSignal・pairAttackEvidence(≤8)に、信念側(kakSet/kc収集/香ペア読み)
 * の窓を揃える。
 */
const M12_PATCHES = [
  {
    name: "M12a-inferPartnerHoldings-kakSet-window",
    old: `      if (h.seat === me && ac <= 4 && (h.koma === "金" || h.koma === "銀" || h.koma === "馬" || h.koma === "香")) kakSet.add(h.koma);`,
    new: `      if (h.seat === me && (h.koma === "香" ? ac <= 8 : ac <= 4) && (h.koma === "金" || h.koma === "銀" || h.koma === "馬" || h.koma === "香")) kakSet.add(h.koma);   // M-12(a): 香のかかり文脈窓をac<=8に対称化(kakariGotaeと一致)`,
  },
  {
    name: "M12c-inferPartnerHoldings-kyoPairN-window",
    old: `      else if (k === "香") inf["香"] = Math.max(inf["香"] || 0, pairN);`,
    new: `      else if (k === "香") { if (ac <= 8) inf["香"] = Math.max(inf["香"] || 0, pairN); }   // M-12(c): 香ペア読みにac<=8窓を追加(kakariGotae/detectSignalと対称)`,
  },
  {
    name: "M12b-firstAtkEvidence-kc-window",
    old: `      const kcHere = !!(kak[h.seat] && kak[h.seat].has(h.koma));
      if (ac <= 4 && (h.koma === "金" || h.koma === "銀" || h.koma === "馬" || h.koma === "香")) {
        const p = partnerOf(h.seat);
        (kak[p] = kak[p] || new Set()).add(h.koma);
      }
      if (!(h.seat in seen)) {`,
    new: `      const kcHere = !!(kak[h.seat] && kak[h.seat].has(h.koma));
      if ((h.koma === "香" ? ac <= 8 : ac <= 4) && (h.koma === "金" || h.koma === "銀" || h.koma === "馬" || h.koma === "香")) {   // M-12(b): 香のかかり文脈窓をac<=8に対称化(kakariGotaeと一致)
        const p = partnerOf(h.seat);
        (kak[p] = kak[p] || new Set()).add(h.koma);
      }
      if (!(h.seat in seen)) {`,
  },
];

/* ===================== M-13: G_Bの騙し香を無条件に無効化 (G_Bスライスにのみ適用) =====================
 * Planner裁定: COOP_SIGNAL有効時のみスキップ、ではなく、G_Bでは無条件に分岐を無効化する。
 * 根拠: honestSignalFilterはG_Bで無条件適用(COOP_SIGNAL非依存)であり、G_Bの設計上のアイデンティティは
 * 「常に正直」(研究モードはB=honestをsetCoopSignal(false)で使う)。COOPゲートでは研究モードの汚染が直らない。
 */
const M13_PATCH = {
  name: "M13-GB-damashiKyou-disable",
  old: `    // 騙し香: 1巡目は香で攻め (王ペアを隠した奇襲) 【個人定石: L2のみ】
    if (rl >= 2 && isFirstAttackForMe(hist, seat) && damashiKyouAttackPhase(view) &&
        kyouMixDraw(myFirstBuryIdx(hist, seat), seat))
      return {koma: "香", why: "騙し香 — 王ペアを隠して香で誘う"};`,
  new: `    // 騙し香: 1巡目は香で攻め (王ペアを隠した奇襲) 【個人定石: L2のみ】
    // M-13(Planner裁定): engine B(coop/honest)の設計上のアイデンティティは「常に正直」。
    // honestSignalFilterはCOOP_SIGNAL非依存で無条件適用されるため、この分岐もCOOPゲートではなく
    // 恒偽ガードで無条件に無効化する(COOP_SIGNAL依存にすると研究モードB=honestの汚染が直らない)。
    if (false && rl >= 2 && isFirstAttackForMe(hist, seat) && damashiKyouAttackPhase(view) &&
        kyouMixDraw(myFirstBuryIdx(hist, seat), seat))
      return {koma: "香", why: "騙し香 — 王ペアを隠して香で誘う"};`,
};

module.exports = { applyPatch, applyPatchList, M11_PATCHES, M12_PATCHES, M13_PATCH };
