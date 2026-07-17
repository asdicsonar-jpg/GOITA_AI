// play_pair.js — 1ディールを「変種Xが NS席・baselineが EW席」「席入替」の2プレイで対戦させ、
// 符号付き得点差 d_i を計算する共有ロジック。ワーカープロセス(run_ab_worker.js)から使う。
"use strict";

const STRONG_OPTS_BASE = {
  mc: true, solver: true, attackMC: true, matchEq: true,
  dd: true, ddLimit: 16, ddDets: 16, wSample: true, danger: true,
  mcDets: 96,
};

function strongOpts(mcSeed) {
  return Object.assign({}, STRONG_OPTS_BASE, { mcSeed });
}

// deal index -> deterministic mcSeed(両プレイ・両変種で同一)
function mcSeedForDeal(dealIndex) {
  return dealIndex + 1;
}

// deal index -> deterministic RNG seed for dealOnce(独立のシード空間。mcSeedと衝突しないよう定数を分離)
function dealRngSeed(dealIndex) {
  return 0x9E3779B1 ^ (dealIndex * 2654435761);
}

const PARENT_ROT = ["N", "E", "S", "W"];

// refG: dealOnce/mulberry32/goshiCheck/advanceの権威実装(未改変のためどの変種でも同一動作)を提供する
// キャンドル用エンジンモジュール。
function buildDealForIndex(refG, dealIndex) {
  const rng = refG.mulberry32(dealRngSeed(dealIndex) >>> 0);
  const deal = refG.dealOnce(rng);
  const parent = PARENT_ROT[dealIndex % 4];
  return { deal, parent };
}

function dealIsPlayable(refG, deal, parent) {
  const chk = refG.goshiCheck(deal, parent, null);
  if (chk.redeal) return { ok: false, reason: "redeal" };
  if (chk.special) return { ok: false, reason: "special" };
  if (chk.needHuman) return { ok: false, reason: "needHuman" };
  return { ok: true };
}

// 1ゲーム(1ディール・1回のプレイ)を実行する。engineOfSeat(seat) -> policyActionを持つエンジンモジュール。
// refGでadvance/newGameStateを行う(全変種で共通のため canonical に統一)。
function playOneMixedGame(refG, deal, parent, engineOfSeat, mcSeed) {
  const st = refG.newGameState(deal, parent);
  const opts = strongOpts(mcSeed);
  let iter = 0;
  while (st.phase !== "over" && iter++ < 400) {
    const seat = st.actor;
    const engine = engineOfSeat(seat);
    const a = engine.policyAction(st, seat, opts);
    if (!a) throw new Error("policyAction returned null/undefined at seat " + seat + " phase " + st.phase);
    const ev = refG.advance(st, a);
    if (ev.gameOver) return ev.gameOver;
  }
  if (st.phase !== "over") throw new Error("game did not terminate within iteration budget");
  return null;
}

// team of a seat (NS/EW) — refGのteam()をそのまま使う
function netForTeam(refG, gameOver, xTeam) {
  if (!gameOver || gameOver.draw || gameOver.winner == null) return 0;
  const winTeam = refG.team(gameOver.winner);
  const otherTeam = winTeam === "NS" ? "EW" : "NS";
  if (winTeam === xTeam) return gameOver.pts;
  return -gameOver.pts;
}

// 1ペア(2プレイ)を実行しd_iを返す。
//   variantX, baseline: policyAction持ちのエンジンモジュール
//   refG: dealOnce/goshiCheck/advance/newGameState/team用の権威モジュール(未改変関数のみ使用)
function playPair(refG, dealIndex, variantX, baseline) {
  const { deal, parent } = buildDealForIndex(refG, dealIndex);
  const playable = dealIsPlayable(refG, deal, parent);
  if (!playable.ok) return { dealIndex, skip: true, reason: playable.reason };

  const mcSeed = mcSeedForDeal(dealIndex);

  // Play1: X = NS, baseline = EW
  const engineOfSeat1 = seat => (refG.team(seat) === "NS" ? variantX : baseline);
  const res1 = playOneMixedGame(refG, deal, parent, engineOfSeat1, mcSeed);
  const net1 = netForTeam(refG, res1, "NS");   // X's team = NS in play1

  // Play2: X = EW, baseline = NS (席入替、同一deal/parent/mcSeed)
  const engineOfSeat2 = seat => (refG.team(seat) === "EW" ? variantX : baseline);
  const res2 = playOneMixedGame(refG, deal, parent, engineOfSeat2, mcSeed);
  const net2 = netForTeam(refG, res2, "EW");   // X's team = EW in play2

  const d = net1 + net2;
  return {
    dealIndex, skip: false, d,
    net1, net2,
    winner1: res1 && res1.winner, pts1: res1 ? res1.pts : 0, draw1: !!(res1 && res1.draw),
    winner2: res2 && res2.winner, pts2: res2 ? res2.pts : 0, draw2: !!(res2 && res2.draw),
  };
}

module.exports = {
  strongOpts, mcSeedForDeal, dealRngSeed, PARENT_ROT,
  buildDealForIndex, dealIsPlayable, playOneMixedGame, netForTeam, playPair,
};
