// goita-app service worker
// 戦略: PLAN_deploy_v84.md に準拠
//   - index.html / ナビゲーションは network-first + cache fallback (更新が届かない事故を防ぐ)
//   - Google Fonts (fonts.googleapis.com / fonts.gstatic.com) の GET のみ stale-while-revalidate
//   - それ以外の cross-origin リクエストは一切触らない(素通し)
//   - activate 時に旧 goita-* キャッシュを削除
//   - skipWaiting() は使わない(対局中の新SW切り替え事故を防止。次回起動時に反映)
//
// 更新時の運用: HTMLを更新するたびに CACHE_NAME を必ずインクリメントすること。

// v120 (2026-07-26): build v100 反映 — T1(Neural Network)エンジン v7→v7s差替 + matchTarget配線。
// v121 (2026-07-26): build v101 反映 — T1ティア表示名変更(「Neural Network」→「NN＠oui2039」)。
// v122 (2026-07-26): build v102 反映 — 「遊び方」の符丁辞書節削除 + 最強AI注意書き追加。
// v123 (2026-07-26): build v103 反映 — T1(最強AI)重みチェックポイント更新(e32844d6-t1_weights.js)。
// v124 (2026-07-27): build v104 反映 — チュートリアルautoステップの自己ペース化(開始/終了ゲート)。
// v125 (2026-07-28): build v105 反映 — 王攻め伏せバグ修正(自席の伏せ王による王攻め解禁)。
// v126 (2026-08-04): build v106 反映 — 枚数読みレイヤー追加(段階0+1・可視化のみ、決定ロジック非接続)。
// v127 (2026-08-04): build v107 反映 — 枚数読みバグA修正(段階2、味方の攻めへのパスを否定証拠から除外)。
// v128 (2026-08-04): build v108 反映 — 枚数読み段階3(Solverの相方保有ゲート・第4局#30型の事故対策)。
// v129 (2026-08-04): build v109 反映 — 枚数読み段階4(sampleWorldC・受けMC決定化サンプラーの席帰属修正)。
// v130 (2026-08-04): build v110 反映 — 枚数読み段階5+6(占有率recvPの台帳化 + beliefMC融合)。
// v131 (2026-08-04): build v111 反映 — beliefMC内部サンプラーのsampleWorldC化 + noMC多重ネスト修正。
// v132 (2026-08-04): build v112 反映 — 味方の攻めを死に王で受け手番を奪う戦術(OU_TAKE_TURN、既定OFF)。
//   第3局#29型の分析(Opus5計画)。反実仮想診断(799候補)でhandLen<=4のみ弱い正の効果、既定は据え置き。
// v133 (2026-08-05): build v113 反映 — 王受け戦術を再計画・closed-form廃止しmcDecideReceiveの
//   margin判定に委譲(Opus5再計画)。#29直接再現(margin+0.084〜+0.125)を確認、既定ON化。
// v134 (2026-08-05): build v114 反映 — 香ペア消極的証拠(kyoNegAttackEvidence、既定OFF)。
//   Sonar訂正読み(香は強い駒なのでペアなら早出しする→出し渋りは非保有の消極的証拠)を
//   pairAttackEvidenceの統計的補集合として実装。A/B中立(49.83%、CI[48.81%,50.86%])のため既定OFF。
// v135 (2026-08-05): build v115 反映 — 香深堀り提案A: KYO_R1_WAIT既定OFF化。段階0診断で成立率
//   0.27%・発火時-33.85点/候補(z=+7.61で受けが優位)と判明。mc:true A/B(16,772局)中立
//   (49.98%、CI[49.22%,50.73%])、発火局限定ペアードは受け優位を強く支持し既定OFF化を採用。
// v136 (2026-08-05): build v116 反映 — 香深堀り提案B: ledgerProbのpHold較正(LEDGER_CAL、既定OFF)。
//   Platt較正でECE改善(48-91%)を確認したが、しきい値近傍の「決め打ち事故率」が悪化(9.6%→11.3%)
//   したため計画の判定木に従い不採用。NULL等価性は害なしを確認済みで実験トグルとして温存。
// v137 (2026-08-05): build v117 反映 — 香深堀り提案2: 香の受け不能判定の確率化(KYO_UNBLOCK_P、既定OFF)。
//   段階0診断でmc:false時は的中率99%超・到達性も基準を大幅に上回ったが、mc:true時に的中率が
//   63%/50%へ崩壊(誤り率35-50%>>5%上限)。原因はledgerNoHoldの「パス=非保有」硬い証拠が
//   MC受け判断のもとで前提を崩される点(komaLedger共通の未知の限界)と特定。計画の事前登録基準
//   によりA/B未実施・既定OFFのまま実験トグルとして温存。freshSolverProbeは67,280回のプローブで
//   bit-for-bit不変を確認。
// v138 (2026-08-05): build v118 反映 — 香深堀り提案6 bit0: 証拠の硬さ階層の分離(相方保有ゲート・
//   「し」限定、既定OFF)。C-3診断でledgerNoHoldの汚染が本番の相方保有ゲートにも波及しうると判明、
//   ledgerBoundsにH1限定のminHard/maxHardを追加しhard枝を切替可能にした。全検証(NULL等価性・
//   freshSolverProbe 67,440プローブ不変・回帰0件)は合格したが、到達性診断で最終着手が
//   1件も変化しなかった(soft枝が100%救済していたため)。計画の判定木に従いA/B未実施・既定OFF。
// v139 (2026-08-05): build v119 反映 — 香深堀り提案6 bit1: ledgerProb下側枝のH1化(全駒種、既定OFF)。
//   到達性は良好(mc:false 566/1,000・mc:true 693/1,000)でbit0とは対照的に本番決定へ実際に波及。
//   精度診断でH3除去がpHold/pAny点推定を統計的に有意に劣化させると確定(McNemar、4条件全てp<0.001)
//   したが、mixed-engine A/B(mc:false段)は51.15%(95%CI [49.37%,52.93%])で有意差なし。
//   Opus5の事前登録停止則(有意差なし→mc:true段未実施)に従いA/B途中終結・既定OFFのまま納品。
// v140 (2026-08-05): build v120 反映 — 香深堀り提案6 bit2: sampleWorldCのH1化(全駒種)。
//   真世界排除率が統計的に有意に改善(mc:true 10.14%→0.00%、McNemar p=6.5e-71)、フォールバック率
//   増加なし、NPS差-0.85%、mixed-engine A/Bはmc:false/mc:trueとも有意な悪化なし。計画の受け入れ
//   基準(精度改善+有意な悪化なしなら既定ON可)を満たし、このシリーズ初の既定ON化
//   (LEDGER_POLICY_EVID 0→4、LEDGER_POLICY_KOMA "shi"→"all")。bit0/bit1は既定OFFのまま。
// v141 (2026-08-06): build v121 反映 — 提案1: 決定化サンプラーの統合(SAMPLER_UNIFY)段階1、
//   不採用で終結。根pick変化率23.89%と到達性は良好、不可能世界サンプル率もoff0.021%→on0.000%
//   と構造的に改善したが、主指標のA-2a完全一致率・A-2b周辺MAEがいずれも有意に悪化
//   (t=-2.17/t=3.90)、NPS低下27.82%も許容超過。Opus5判定: sampleWorldWの重みは提案分布の比を
//   含まないため差し替えは事後分布そのものの置換になり、bit2既定ON後は追加できる情報が
//   H1境界(効果上界0.021%)のみで割に合わない。事前登録判定木のD分岐により既定OFFの実験
//   トグルとして残置、段階2(攻め伏せMC)は恒久的に取り下げ。
// v142 (2026-08-06): build v122 反映 — SAMPLER_BURY_FIX: sampleWorldの伏せ廃棄重み(BURY_PRIOR)を
//   nDis(伏せ回数、実測で0〜6の可変値と判明)で層別し実測値へ較正、既定ON。単一プール重みでは
//   nDis=1層とnDis>=2層が誤差を相殺しあう「層間の打ち消し合い」が生じたため2群独立較正
//   (L2縮小shrinkage・ガードレールクリップ[0.5,2.0]併用)。holdout残存比は全層50%未満、
//   ノイズ床診断・対応付きブートストラップ改善量診断のいずれも良好。方式B(サンプラー
//   アルゴリズム置換)はnDis=1で逐次性が数学的にゼロなため無効と判定し棄却。mixed-engine A/Bは
//   レビュー指摘(非ペア設計・停止則未遵守)を受けペア化ハーネスに修正し9,000局まで延長再実施
//   (同一配牌シード対・n=615対・9,096局)、新エンジン勝率50.42%(95%CI [49.39%,51.45%])で有意差なし。
// v143 (2026-08-06): build v122 コメント更新のみ(コード変更なし) — 再レビュー(承認・Must-fixなし)
//   の指摘2件を反映。(1) ペア化A/Bの単位定義を実装レポートに明文化: ペア化単位は勝負レベル
//   (615対=1,230勝負、約7.4局/勝負)であり、「局あたり得点差」は各勝負の(新チーム最終得点−
//   旧チーム最終得点)/局数を先に勝負単位で正規化し、同一シードの2アサインメント平均を対の
//   代表値として対応ありt検定にかけた2段階集約値であることを明記。(2) 本コメント自体の
//   CACHE_NAME繰上げ。BURY_FIX_MODE既定1(較正ON)を維持したままデプロイ可。
// v144 (2026-08-06): build v144 反映 — T1(最強AI)重みチェックポイント更新(Sonar提供の
//   t1_weights.js、sha256全文27dacc92bd89379f...)。データのみ差替、スキーマ完全一致・
//   エンジン/アダプタ無変更。自己対戦A/B(duplicate pairing、全4席T1・1,338対=2,676局)
//   で新チェックポイント勝率51.9%(95%CI[50.0%,53.8%]、z=1.97で有意)、winrate-neutral-
//   or-better基準を達成。
// v145 (2026-08-06): build v145 反映 — 「AI: 対人協調(coop)」ティアのUI削除(Sonar依頼、
//   goita-dev-loop Planner=Fable5/Executor=Sonnet5、Sonar裁定「案B: UIの選択肢だけ削除」)。
//   席構成セレクト3箇所のcoop選択肢を削除、cfg-N既定をstrongに変更、TIER_LABELからcoop削除、
//   LADDER_PRESETS(beginner/practice/tournament)の北席既定をcoop→strongに変更(探索設定は
//   coopとstrong同一のため強さ不変)。旧保存対局のtiers="coop"はresumeSavedMatchでstrongへ
//   正規化。COOP_SIGNAL/coopContext/G_Bブロック本体/honestSignalFilterはコード無変更で存置。
// v146 (2026-08-08): build v146 反映 — 提案C-dd: rolloutのddホライズン打ち切り(LEAF_DD、既定OFF)。
//   Sonar提案C(T1 value_headをstrongの末端評価に流用)をOpus5計画。段階0診断でT1 forward実測
//   45.3ms/callが必要19,312回/局→予算1,200倍超過・9,000局A/Bが1アーム37時間で検証不能と判明し
//   原案却下。代替として、rolloutが必ず残駒total<=16を通過してから終局まで弱方策で進む構造
//   (到達性100%実測)を利用し、その通過点で既存のddSolve厳密解に打ち切る方式(C-dd)を採用。
//   rollout()にevalFn引数を追加、forcedFirst消化後にのみ発火するガードで実装、buryMC/attackMC
//   (evalIn)/mcDecideReceiveの3呼び出し元に配線(G/G_B両ブロック)。NULL等価性(LEAF_DD=0既定で
//   selfTest 428局が旧v145とbit-for-bit完全一致)・G/G_Bミラー一致・reachability(LEAF_DD=1で
//   leafDdHit 19,471回・fail 0件・回帰0件)を確認。ただし実測コストは1局あたり約10.6倍
//   (48.2ms→507.7ms/局)と計画の想定(+37〜316%)を大幅に上回り、事前登録A/Bを実施可能な規模まで
//   縮小するにはmcDets等の追加調整が必要。既定OFFのまま実験トグルとして温存、A/B本実施は
//   別セッションへ持ち越し。
// v147 (2026-08-09): build v147 反映 — 方向3-A1「coop取り残し」整理(fugu計画・案B-1+任意B-2)。
//   coopティア(v145でUI削除済み)の裏側ロジックの実害確認と整理。実害は説明矛盾のみ(機能欠落なし、
//   engineFor/tierOptsのcoop分岐は到達不能・無害と確定)。(1)ユーザー可視の「対人協調AI」言及8箇所
//   (遊び方mc.desc・定石辞書signal_honesty/barabara・ドリル説明2箇所)を実態(strongティア/naive相方
//   +連携ヒント)に沿って修正。(2)到達不能なcoopコード(engineFor/tierOptsのcoop分岐・COOP_SIGNAL
//   宣言・バラバラ宣言のCOOP_SIGNALゲート、G/G_B両ブロック)に"dead since v145"コメントを付与(削除
//   はしない・5点差分規約維持)。coopContext()・resumeSavedMatchのcoop正規化は無改変。
//   検証: node --check(7ブロック)全通過、G/G_B diff=従来の7箇所のまま(新規差分なし)、
//   NULL等価性(mc:false 60/60・mc:true 15/15 selfTest結果がbit-for-bit完全一致)、
//   coopContext/resumeSavedMatch文字列完全一致を確認。
// v148 (2026-08-09): build v148 反映 — 方向3-U1「AIの読み(pEnemyReceives/pHold)の可視化」
//   (fugu計画・Phase0〜2完遂)。原則どおりG/G_Bエンジンは無改変、appブロックのみの変更。
//   Phase0で確定: pEnemyReceives/pHold(komaLedger経由)はclosed-form(MC不使用)で既存の
//   G.komaLedger/G.pEnemyReceives(いずれも既存export)を読み取り専用で呼べば新規算出コストなしに
//   取得可能。受け候補のEV(mcDecideReceiveのmeans)は新規MCなしには取得不能なため、fuguの
//   フォールバック方針どおり既存getRec()の推奨手のみを再利用した簡易表示にスコープを縮小。
//   実装: 新規トグル「読みヒント」(app.cfg.readHint、既定OFF・COACH_TIERS経由でbeginner=ON/
//   tournament=OFF/practice=OFF)。attackフェーズは各攻め候補に受けられ率バッジ(色+%+cud時は
//   記号●▲併記)、respondフェーズは推奨候補に簡易バッジ、長押し駒札(komaCardSubLines)に
//   相手の保有推定(pHold)を追記。自分の手番のみ表示(既存の手番制御を流用)。SCAFFOLDS(足場卒業
//   システム)への統合は意図的に見送り(確率表示は卒業判定になじまないため)、コメントで明記。
//   検証: node --check(7ブロック)全通過。G/G_B diff=従来の7箇所のまま(G/G_Bブロックはbyte単位で
//   変更前と完全一致・今回の変更が全てappブロックに閉じていることを直接確認)。NULL等価性
//   (mc:false 60/60・mc:true 15/15 selfTest結果がbit-for-bit完全一致)。komaLedger/pEnemyReceives
//   の戻り値レンジ(0〜1)を実対局データで検証。
// v149 (2026-08-09): build v149 反映 — U-1バグ修正「rh-badge(読みヒントバッジ)見切れ」解消。
//   Sonar報告: 駒の下に出る%/推奨バッジの文字が上半分しか見えない。原因: .rh-badgeは駒の下
//   (bottom:-7px)にはみ出す作りのため、#handが複数段に折り返すと次段の駒に下半分が隠れ、
//   最終段では#handareaの余白を超えて#actionbarに隠れていた(いずれもCSSのみの表示不良、
//   ロジック無関係)。対処: body.readHint(app.cfg.readHintと同期する新規bodyクラス、
//   既存body.cudと同方式)スコープで#handのrow-gapとpadding-bottomを28px確保し、読みヒント
//   OFF時の見た目は完全に不変のまま解消。bodyクラス同期はapplyCfgSideEffects()・readSetup()・
//   調整モーダルの3箇所(cfg反映点)全てに配線。
//   検証: node --check(7ブロック)全通過。G/G_B/T1/他ブロック(0-5)は変更前とbyte単位で
//   完全一致(CSSは<head>内、JS3行はappブロックのみに限局)。CSS変更のためNULL等価性は
//   G/G_Bブロック不変により自明に保証。
// v150 (2026-08-10): build v150 反映 — v149の見切れ修正では治らなかった件の真因対応。
//   Sonar再報告: 折り返しが無い1段の手駒でもバッジの文字が上半分しか見えない。
//   web検索で確認(clip-path/filterは、はみ出す絶対配置の子要素も自身のborder-boxでクリップする、
//   overflow:hiddenと同種の挙動): .rh-badgeは.koma(clip-path+filter持ち)の子要素だったため、
//   bottom:-7pxではみ出す部分が常に.koma自身のclip-pathでクリップされていた(折り返し無関係・
//   v149の行間/余白調整では対処不能な原因)。
//   対処: renderHandTrayで各駒を.koma-slot(position:relative、clip-path/filterなし)でラップし、
//   rh-badgeを.komaの子ではなく.koma-slotの子(=komaの兄弟)として配置。#handの実際のflex項目が
//   .komaから.koma-slotに変わったため、モバイル1段固定(flex:0 0 auto;min-width:0)とペア詰め寄せ
//   (pair-cont の margin-left)を.koma-slot側にも複製・移設(元の.koma側ルールは到達不能コメントを
//   付けて残置・削除しない)。
//   検証: node --check(7ブロック)全通過。G/G_B/T1/他ブロック(0-5)は変更前とbyte単位で完全一致
//   (appブロックのみの変更)。jsdomによる構造検証: renderHandTrayの実装を抽出して実行し、
//   全8枚でrh-badgeが.komaの子ではなく.koma-slotの子(=komaの兄弟)になっていること、pair/pair-cont
//   クラスが.koma-slot側に付与されることを確認(実ブラウザでのレンダリング確認は本セッション環境の
//   制約により未実施)。
// v151 (2026-08-10): build v151 反映 — OU_SIG_MIRROR(王持ち合図のし偽信号回避のミラー化、
//   Opus5計画PLAN_王持ち合図のし偽信号回避修正_Opus5.md)。Sonar報告: 第2局#27で北の攻め候補が
//   し(占有率0.61)と馬(占有率0.30)のとき、味方(南)が初手し攻め・場のし残数から見て人間ならし攻めが
//   自然なのにAIは馬を選んだ。原因はF2/F3: 送り手側の偽信号回避(ouSignalContextNow、しを打つと
//   「王持ち」と誤読されるかを自己判定して攻め候補から除外)が、読み手側の正典(detectOuSignals /
//   partnerSignaledOu、M-11ガード=partnerSignaledShi/shiStartedで既にし攻め継続中と分かる場合は
//   王合図と読まない)より緩い述語を使っていたため、相方が絶対に王合図と読まない「し」まで
//   除外していた(送り手/読み手の定義不整合、新ヒューリスティックではなく既存バグ)。
//   対処: 新関数ouSigAvoidNow(hist,seat)を追加し、OU_SIG_MIRROR=1のとき読み手側の正典
//   detectOuSignalsに「これから打つし」を仮追加して問い合わせる方式に統一(=0は従来のまま、
//   NULL等価性の担保点)。S1(MC候補フィルタ)・S2(フォールバック)・S3(ごめんなさいのし、
//   Phase0-Eで発火0件を実測確認済み)の3箇所を差し替え。送信分岐・規約の意味論・読み手側は無変更。
//   検証: Phase0-A(空振り率30%、ゲート10%を通過)・Phase0-D(着手変化率0.56%/0.41%、
//   オラクル一致率差(McNemar)+23.0pt 95%CI[+13.9,+32.1]、決着再生の得点差+8.97点/局
//   95%CI[+5.00,+12.94]、Sonar#27個別: オラクル値が馬-50→し+40の90点差)・Phase0-E(S3発火0件)・
//   NPS(-2.9%、ゲート+10%以内)全通過。node --check(7ブロック)・G/G_B diff=7hunk(内容不変)・
//   NULL等価性(setOuSignal true/false×selfTest bit-for-bit一致)確認済み。
//   mixed-engine A/B(ペア化615対9,074局、setOuSignal(true)を両エンジンに明示): 新勝率50.31%
//   (95%CI[49.28%,51.34%]、下限48.5%基準通過)・ペア化得点差(paired)+0.408点/局
//   (95%CI[+0.048,+0.767]、0を含まず正)。判定木分岐B(中立・整合性修正として既定1採用、
//   v122と同じ判断枠組み)によりOU_SIG_MIRROR既定1で反映。
// v152 (2026-08-10): build v152反映 — 読みヒント攻めバッジを「受けられる確率」から
//   「通る目安」(1-受けられる確率)表示に反転(Sonar指摘: 緑なのに数字が低く誤読される問題)。
//   Fable5計画PLAN_受けられ率バッジUX改善_Fable5.md準拠。色は表示値から導出し丸め起因の
//   矛盾を解消、攻めフェーズ限定の凡例行(#rh-legend)を追加してホバー無しでも意味が伝わる
//   ようにした。UI表示層のみの変更でエンジン(G/G_B)は無変更、G/G_B/T1ブロックはbyte単位で
//   変更前と完全一致(機械検証済み)。
// v153 (2026-08-10): build v153反映(Phase1) — 受けMC矛盾バグA/B修正(Fable5計画
//   PLAN_受けMC矛盾バグA_B修正_Fable5.md準拠)。Sonar報告: 手駒バッジは「し」推奨なのに
//   ミスガードダイアログは「なし」が明確推奨と警告する矛盾。バグA(G/G_B): mcDecideReceive()の
//   noteラベルがロールアウトスキップ用フラグdets=0をそのまま流用しGIB式DD経路使用時も
//   常に「0決定化」と誤表示していたのをusedDD/ddN分離で修正。構造修正(appブロックのみ):
//   missGuardWarn()に「AIが推奨する駒そのもの(getRec一致)には根拠レンズが違っても警告しない」
//   不変条件を追加し、getRec(policyAction層)とcandidateRanking(生MC評価のみ)が正当に
//   食い違う場合でも矛盾表示が発生しない構造にした。candidateRanking()にキャッシュを追加
//   (Phase3向けの布石)。G/G_B diff hunk数=7維持・block0/3/4/5byte完全一致・NULL等価性
//   (pick/means bit-for-bit不変)・第5局#31フィクスチャで矛盾再現→不変条件で解消を確認。
//   なお受け評価の統計的サンプル不足(バグB)自体はPhase2で対応予定(A/B必須のため本ビルドは
//   構造修正+表示修正のみ)。
// v154 (2026-08-10): build v154反映(Phase2) — 受けMC矛盾バグB修正、DD_ADAPT(適応延長)実装。
//   Phase0診断でddDets固定64(FLAT64)はNPS実測+70.2%でコストゲート超過し不採用、BASE16/BLOCK8/
//   MAX48/Z1.96の適応延長(DD_ADAPT)はREF一致率96.9%・NPS実測+12.85%でゲート内に収まり採用。
//   既存ddループは無改変、DD_ADAPT=0で完全NULL等価。mixed-engine A/B(n=5,817局、NS/EW交互に
//   新旧エンジン付与)で新エンジン勝率58.38%(95%CI[57.11%,59.65%])・ペア化得点差+5.687点/局
//   (95%CI[+4.813,+6.560])と非劣性基準を大幅にクリアしたため既定ON化。king/receive/
//   conservation違反0件(混合300局・単一140局)。詳細はPhase0診断レポート・Phase2実装レポート参照。
// v155 (2026-08-10): build v155反映(Phase3) — candidateRankingパリティ(三者一致の完成)。
//   appブロックのみ。candidateRanking()の呼び出しをG.mcEvalReceive(st,seat,adviceOpts())に
//   変更し、getRecの実際のMC評価経路と厳密同一のoptsに揃えた(v94コメントの「完全同一化」の
//   実態齟齬を解消)。第5局#31フィクスチャでclarityが「明確(なし)」→「互角」に変化し、
//   dd領域n=350全件でcandidateRankingとmoveHint(getRec相当)のpick一致率が80.9%→92.6%に
//   改善。残差はv96'''タイブレーク等getRec固有の分岐によるもので想定内、Phase1の
//   missGuard不変条件が引き続きカバーする。G/G_Bは無変更(byte完全一致)。
// v156 (2026-08-10): build v156反映(攻め矛盾Phase1) — 占有率推奨とバッジ矛盾の開示注記。
//   Sonar報告: 攻め選択でバッジ(通る目安)最良と推奨(占有率フォールバック)が大きく乖離する
//   ケース(第5局#21、銀100% vs 金48%)。原因はhand.length>4&&RULE_LEVEL=2でMCペアワイズ枝が
//   スキップされ、受けられ確率を見ない占有率ヒューリスティックに落ちること、かつrecvRisk
//   (pEnemyReceivesによる割引)がtierOpts/adviceOpts双方に存在しない(三者一致のため過去に
//   意図的に除外)こと。Fable5計画PLAN_攻め占有率推奨と通る目安の矛盾修正_Fable5.md Phase1
//   準拠。attackChoiceの占有率フォールバックにsrc:"occ"を付与(挙動無影響)、appブロックに
//   乖離開示注記(atkOccNote)を追加。推奨駒・実対局AIの着手は不変(NULL等価性800局22,552手で
//   確認)。バグB根本(占有率ヒューリスティック自体の改善)はPhase0診断→Phase2(A/B必須)で対応。
// v157 (2026-08-10): build v157反映(攻め矛盾Phase2) — 占有率フォールバックへ「通率バンド
//   絞り込み」(D2案)を実装、既定ON。Phase0診断で参照オラクル一致率(Fable5計画のG1指標)は
//   本問題の局面群(手駒5〜8枚)では測定手法自体が高ノイズ(同一手法を効力違いで走らせても
//   自己一致率61〜80%止まり)と判明したため、G1判定木は機械適用せずSonar裁定によりmixed-engine
//   A/Bを最終ゲートとして直接採用。バッジと同一の台帳(plain komaLedger)で通り確率を求め、
//   最良候補から25pt以内の候補のみに絞り込んでから占有率で選ぶ(戦略的価値=score()は温存)。
//   タイブレークもrecvP昇順→POINTS降順に変更(atkBand有効時のみ、既定OFF時はArray.sortの
//   安定ソートで従来の並び順を完全維持しNULL等価)。第5局#21フィクスチャで金→銀(バッジ最良と
//   一致)に修正されたことを確認。NULL等価性(775局・21,849手・0件不一致)、node --check・
//   G/G_B diff hunk数=7(不変)・block0/3/4/5 byte完全一致を確認。mixed-engine A/B(ペア化、
//   同一配牌シード対でNS/EW入替、n=9,000対=18,000局)で新エンジン勝率53.72%
//   (95%CI[50.93%,56.51%]、下限が50%を上回り既定ON基準を通過)、ペア化得点差
//   +0.487点/局(95%CI[+0.189,+0.814]、0を含まず正)。クラッシュ0件(250〜400局規模の
//   複数回帰で確認)。詳細はPhase0診断レポート・Phase2実装レポート参照。
// v158 (2026-08-10): build v158反映(攻め矛盾Phase3・最終) — 乖離開示注記(atkOccNote)の恒久
//   テレメトリ。計画書§5どおり注記自体は削除せず安全網として存置し、発火カウンタ(checks=占有率
//   フォールバック推奨が人間に提示された回数、fires=実際に注記が出た回数)と直近200件のログ
//   (推奨駒/src/recvP分布)を追加。表示・判定ロジックへの影響ゼロ(副作用専用のappブロック追記、
//   window.__atkOccTelemetryでdevコンソールから参照可能)。G/G_Bはbyte単位で完全一致・
//   diff hunk数=7(不変)。A/B不要(計画書どおり)。攻め占有率矛盾の一連の対応(Phase1開示注記
//   build v156→Phase0診断→Phase2 D2案実装+A/B既定ON build v157→Phase3テレメトリ build v158)
//   はこれで完了。
// v159 (2026-08-10): build v159反映(符丁モデリングPLAN_単発早攻めの同種保有符丁_Fable5.md、
//   Phase A〜C) — 敵の単発自発早攻め(1巡目・応え文脈でない)を同種2枚以上保有の符丁として読む
//   SOLO_SIG機構をG/G_Bに追加。Phase A実測: 信号自体は自発時98.7〜99.5%(金/銀/馬)の高精度、
//   到達性14.3%(全攻め決定中)・追加コストは無視できる水準(0.065マイクロ秒/回)。しかし
//   Phase C(mixed-engine A/B・ペア化9,000対=18,000局)で勝率50.85%(95%CI[44.49%,57.20%]、
//   50%を含み優位性なし)、較正指標(Brierスコア)もON側で悪化(0.1127→0.1192、95%CI
//   [-0.0152,+0.0019])と判明。計画の事前登録基準(優位性または無害性+較正の有意改善)を
//   いずれも満たさないため、計画どおり既定OFFの実験トグルとして温存(komaLedger/pCanReceive
//   に配線済み・setSoloSig(true)で有効化可能)。NULL等価性(687局・19,520手・0件不一致)、
//   プロパティテスト(835,128組・フロア単調性違反0件・香し等スコープ外駒種への漏洩0件)、
//   node --check・G/G_B diff hunk数=7(不変)・他ブロックbyte完全一致を確認。
//   Brier悪化の分析: フロアはevidence-active局面の一部(地上真実で「もう保有していない」
//   ケース、約21%)で予測を悪化させ、komaLedgerが既に(bury等の別証拠から)正しく低く見積もって
//   いたケースを単純max()フロアで押し上げてしまう副作用が示唆される。今後この機構を再検討する
//   場合、フロアの一律適用ではなく既存証拠との整合(重み付き統合)が必要。
// v160 (2026-08-10): build v160反映(Fable5レビューMust-fix対応、修正レポート_単発早攻め符丁_
//   SOLO_SIG_Fixer_build_v160_Sonnet5.md) — M1(硬い制約ガード。L.max[s][k]===0/
//   L.residual[k]===0が成立する場合フロア不適用。修正前は算術的に確定した0を上書きする
//   バグがあり、n=64,852ペア中1,145件で発生を実測確認、修正後n=109,373ペアで0件)、
//   M2(bluffプロファイル除外を firstAtkEvidence 依存に加え soloSigEvidence 内でも明示的に
//   二重化)、M3(soloSigEvidenceがkc:true・ac 5-8の未測定域まで拾っていた実装漏れを
//   kc:false&&ac<=4に修正。修正前はフィクスチャ(b)で応え文脈=かかり応えを符丁として誤検出
//   することを確認、修正後は正しく除外)を実施。
//   M3は評価対象の証拠集合そのものを変える実質的なバグのため、Phase C(mixed-engine A/B・
//   Brier較正)を再実行: 勝率は引き続き有意差なし(50.64%、95%CI[44.64%,57.08%]、n=9,000対)。
//   一方Brier較正は修正前の悪化(0.1127→0.1192)から一転し有意に改善(0.1173→0.0948、
//   改善0.0225、95%CI[0.0203,0.0246]、n=3,000、金銀馬いずれも改善)。計画§5の無害性判定枠
//   (得点差に有意な悪化なし+較正が有意に改善)を新たに満たすため、既定値の再判断をSonarに
//   確認中(このデプロイ時点ではSOLO_SIGは既定OFFのまま、コード上の安全ガードのみ反映)。
//   NULL等価性(478局・13,627手・0件不一致)・node --check・G/G_B diff hunk数=7(不変)・
//   他ブロックbyte完全一致・プロパティテスト(569,712組・単調性/scope違反0件、うち硬い制約
//   ペア109,373組で違反0件)を確認済み。
// v161 (2026-08-10): build v161反映(計画書_提案N_攻めdd経路へのDD_ADAPT横展開_fugu.md、
//   診断レポート_ATK_DD_ADAPT_Phase0_Sonnet5.md) — 受けDD_ADAPT(build v154・+5.687点/局)の
//   同型機構(適応延長・BASE16/BLOCK8/MAX48/Z1.96)を攻めdd経路(attackMC)へ横展開。
//   Phase0実測: 決定あたりdd発火率は攻め2.31%・受け2.39%で同水準だが、1局あたり絶対発火数は
//   攻め0.19回/局・受け0.38回/局とほぼ半分(Fable5レビュー訂正: 効果上限が受けより小さいという
//   計画書の懸念は方向として正しかった)。適応延長でREF一致率が全体+6.9pt・接戦局面
//   (margin<0.05)+17.0pt改善、NPS増は+1.7〜4.5%(ゲート15%以内)。mixed-engine A/B(ペア化
//   9,000対=18,000局)で新エンジン勝率57.35%(95%CI[50.71%,63.98%])、事前登録基準
//   (CI下限>50%)を満たし既定ON(局あたり換算+0.05点、受けの約1/100の効果量)。既存ddループは
//   無改変、ATK_DD_ADAPT=0で完全NULL等価(NULL等価性483局・13,503手・mismatches=0)。
//   node --check・G/G_B diff hunk数=7(不変)・他ブロックbyte完全一致。
//   【確認的追試・確認的追試レポート_ATK_DD_ADAPT_Sonnet5.md】新規シード群(9,000対)で再実施:
//   追試単独で勝率60.68%(95%CI[53.88%,67.48%])、当初分との合算(n=417決着対)で58.99%
//   (95%CI[54.20%,63.55%])と、当初の僅差合格(CI下限50.71%)から明確に改善して優位性を
//   再確認。事前登録の撤回条件(合算CI下限<50%)に該当せず、既定ONを維持。
// v162 (2026-08-11): build v162反映 — T1(最強AI)重みチェックポイント更新(Sonar提供の
//   t1_weights.js、sha256=5332b682...、旧: sha256=374f94f1...)。データのみ差替、スキーマ
//   完全一致(encoder_version=v7s・d_model128/n_heads4/n_layers6・weights内149テンソルキー
//   集合が旧チェックポイントと完全一致・shi_clf fmt=5shi_adv_v2/hidden=32・v_match_300あり、
//   いずれも旧チェックポイントと同一)、t1_engine.js/t1_adapter.js側の変更は不要。
//   新旧チェックポイント直接対戦A/B(duplicate pairing、全4席T1・200対=400局、v144の前例
//   〈1,338対〉より縮小規模)で新チェックポイント勝率50.00%(95%CI[45.10%,54.90%])、
//   winrate-neutral(有意な悪化なし)を確認。node --check(7ブロック全て)・G/G_B diff
//   hunk数=7(不変、block1/2は無変更のためbyte完全一致)・t1_adapter動作確認(40局・
//   フォールバック0件・決定論PASS)・新旧T1着手差異5.3%(重み更新が反映されていることを確認)。
// v163 (2026-08-12): build v163反映(PLAN_香forced証拠修正_Phase1_Fable5.md・C'案、Sonar承認
//   「よい」2026-08-12) — komaLedger「香100%通る」誤断定バグ修正。H3(ledgerNoHold由来のパス証拠)
//   のみに由来するforced/impossible主張が算術的確定(H1)と同格のpHold=1/0断定になっていた過剰
//   確信を、両側cap/floor(LEDGER_H3_CAP=0.95/LEDGER_H3_FLOOR=0.10)で較正的に妥当な範囲へ抑える。
//   新トグルLEDGER_H3_SOFT、既定OFF(false)。対象: ledgerProb・ledgerRefine(独立の未ガード上書きを
//   同型修正、終盤の再発防止)・ledgerTier(facts.isH3フラグ追加)・countWhy/readingNotes(H3のみ由来
//   の表示文言を「n枚確定」→「n枚濃厚(パス根拠)」に切替)。同時にD2で確定した意味論バグ(minHard=
//   「手駒+伏せ」の下限を「手駒のみ」のpHold=1に誤読み替え)も同じ行の修正として同梱。
//   出典: 診断レポート_香forced証拠_Phase0_Sonnet5.md(600局/2,774エピソード、Fable5レビュー承認済み)。
//   検証: node --check(7ブロック全て)・G/G_B diff hunk数=7(不変、全編集をbyte同一で両ブロックへ
//   適用)・NULL等価性(LEDGER_H3_SOFT=false既定、v161(=v162)block1とのSHA-256着手列一致
//   170/170局、mc:false/true both)・回帰フィクスチャ(seed=970002/iter=16/南/香: OFF時pr=0.0000
//   バグ再現・ON時pr=0.1900で解消)・較正検証out-of-sample(seed920001系600局・16,906観測、
//   Brier 0.05347→0.05243〈改善1.93%〉、pr=0バケット実際的中率8.2%→0.0%、点精度93.82%→93.87%
//   〈非劣化〉)・mixed-engine A/B(paired、単発対120対+フルマッチ120対、点差ONほぼ0〈95%CI
//   [-13.65,+12.40]〉・119/120マッチが完全同一結果=無害性を強く支持)。build v163は既定OFFで出荷。
// v164 (2026-08-12): build v164反映 — LEDGER_H3_SOFTをSonar裁定「既定ONにして正式採用」により
//   既定ON化(false→true)。コード変更はこの1行のみ(トグル自体・cap/floor値・分岐ロジックは
//   v163から無変更)。node --check(7ブロック全て)・G/G_B diff hunk数=7を再確認。ロールバック用に
//   setLedgerH3Soft(false)は引き続き利用可能。
// v165 (2026-08-13): build v165反映 — 設計仕様書改訂第3版 §5-2(詰ごいたビットパッキング)・
//   §5-4(詰ごいたエディタのリアルタイムバリデーション)の実装(Sonar依頼)。index.html UI層に
//   TsumePack(combinadicによる32駒配置のBase64url 14文字固定エンコード/デコード)と
//   TsumeValidate(KOMA_TOTAL上限・G.canAttackKing王解禁条件・G.UNCUTTABLE香/し王受け不可、
//   による整合性チェック)を追加。両者とも既存のG.counter/G.fullDeck/G.canAttackKing/
//   G.UNCUTTABLEを再利用するのみで既存関数は一切変更していない(KOMA_TOTAL 17111行目も無変更)。
//   詰ごいたエディタUI自体・対局フローへの結線はまだ行っていない(新規追加のTsumePack/
//   TsumeValidateはどこからも呼ばれない未接続のユーティリティ関数、既存のAI思考/対局ロジックへの
//   経路なし)。検証: node --checkでUI層script構文OK、index.htmlからの差分はbyte-exactで
//   17111行目直後への202行の単一挿入のみ(diff確認済み、他行の変更ゼロ)。TsumePack/TsumeValidate
//   単体はNode.js上でランダム3,000往復テスト(全一致・エンコード長14文字で安定)およびバリデーション
//   5シナリオ(正常配牌/駒数超過/手札0枚重複/王攻め解禁条件あり・なし)で確認済み。
//   対局AI(beliefMC等)・勝率には無関係(未接続のため)。仕様書側の駒数表記「し:8枚」は実装の
//   KOMA_TOTAL(し:10枚、合計32枚)と不一致だったため、本実装は常に実装値(KOMA_TOTAL)を正とする。
// v166 (2026-08-13): build v166反映 — PLAN_QR_sync_branch.md 実装(Sonar依頼)。QRコードによる
//   盤面即時同期を追加。(1)newMatch()/startGame()にapp.matchSeed/app.dealSeqを追加保持(既存の
//   対局進行ロジックは無変更、通常プレイに影響なし)。(2)matchSeed+dealSeq+手順を数十バイトに
//   packするqrPack/qrUnpack/qrRecFromUnpacked(既存の#pos=共有=sharePayloadとは別の軽量#qpos=
//   形式として共存、既存共有機能は無変更)。(3)qrcode-generator v2.0.4(MIT)・jsQR v1.4.0
//   (Apache-2.0)を配布物のままterserでminifyしてindex.htmlにベンダリング(外部CDN依存なし、
//   オフラインでもQR機能が動作)。(4)共有モーダルに「QRコードで共有」ボタン、セットアップ画面に
//   「QRコードを読み取って局面を開く」ボタン(カメラ/画像選択の2経路、BarcodeDetector APIは
//   2026-08時点でiOS Safari未対応のためjsQRのみで統一)。
//   検証: node --checkで全9 script要素の構文OK。qrPack/qrUnpack往復500試行(Node.js)全一致。
//   rec→QR画像生成(vendored qrcode)→jsQRデコード→matchSeed+dealSeqでの配牌再現、という
//   フルパイプラインを実際にindex.htmlへ挿入したコードそのもので30試行、全一致を確認。
//   未検証(実機が必要): 実際のカメラ(getUserMedia)でのスキャン・iPhone実機での動作。
// v167 (2026-08-13): build v167反映 — QR画像そのものをクリップボードへコピー/保存できるように
//   showQrForRec()に「QR画像をコピー」「QR画像を保存」ボタンを追加(既存のcopyImageAndKifu・
//   sm-imgsaveと同じClipboardItem/Blobパターンを踏襲)。他の挙動への影響なし(追記のみ、36行純増)。
// v168 (2026-08-13): build v168反映 — マッチ終了モーダルの「共有」を拡張し、そのマッチ内の
//   好きな局を選んでQR共有できるようにした。shareGameFromMatchEnd()がapp.matchRecsを
//   現在のapp.matchNoで絞り込み、1局のみなら従来通り即共有、2局以上ならopenMatchGameSharePicker()
//   の一覧から選ばせる(既存のshareGame/shareRecModal/QR機能はそのまま再利用、新規ロジックは
//   ピッカーUIのみ)。他の共有経路(振り返り・対局中)は無変更。
// v169 (2026-08-13): build v169反映 — Sonar依頼2点。(1)共有時の席呼称をSEAT_JA(東西南北)から
//   seatDisp/seatDispFor(自分/相方/上家/下家、app.humanSeat基準)へ変更(recToKifu・viewKifu・
//   drawBoard[共有画像の席名/チーム名/攻め番表示]が対象。従来「共有はSEAT_JA不変」としていた
//   設計から変更)。(2)QR/URL経由で読み込んだ対局(rec.imported)の振り返りに視点切替(北/東/南/西)
//   セレクタを追加。切替はapp.humanSeatを差し替えてopenReviewOn()を再実行するのみ(新規の
//   状態管理を増やさず既存の初期化パスを再利用)。既知の制約: 振り返りを閉じてもapp.humanSeatは
//   元に戻らない(enterReviewFromShareが元々"S"に固定していた既存挙動と同じ性質)。
// v170 (2026-08-13): build v170反映 — 振り返りを閉じた際、QR/URL読込や視点切替で変わった
//   app.humanSeatを、振り返りに入る前の値へ復元するようにした(app._humanSeatBeforeReview、
//   enterReviewFromShare/openReviewOnの初回入場時のみ退避しclosReview()で復元・消費)。
//   通常(読込でない)振り返りではhumanSeatは元々変化しないため実質無害。
// v171 (2026-08-13): build v171反映 — Sonar依頼2点。(1)視点切替セレクタの選択肢を「北/東/南/西」
//   から現在の視点基準の相対呼称(自分/下家/相方/上家)へ変更(renderSeatSwitchOptions()、valueは
//   実際の席コードのまま)。(2)局面共有画像(drawBoard)で席名(自分/相方/上家/下家、可変長)と
//   チーム名(あなた組/相手組)が固定オフセットのままだったため後続の「手N」等と重なっていたのを、
//   ctx.measureTextで実測してから次要素の開始位置を決めるよう修正。
// v172 (2026-08-13): PLAN_shi_attack_v2.md準拠、SHI_TEAM実装。実対局(相方が伏せ前し4枚+馬ペア、
//   自分が5し宣言者=チーム合計9枚)で相方が馬を選んだ根本原因(伏せでし4→3に減り攻め条件の枚数・
//   ペア両方が不成立→占有率フォールバックがgoshiHoldersを無視)を修正。新設estimatePartnerShi/
//   shouldShiAttackで「自分の実し枚数+相方推定し枚数(goshi確定情報 → 自分のし攻めへの相方応答
//   [受け=4/スルー=3] → 相方のし先導 → 未合図=0 の優先順)」がしきい値(通常7・自分がgoshi宣言者
//   なら8)以上ならペア併存でもし攻めを優先。buryChoice/attackChoice/receiveChoiceにOR条件で追加、
//   G/G_B両エンジンに同一diff適用(diff hunk数は既存の意図的差分のみで一致確認済み)。副次的に
//   cloneStateForRollout/ddCloneでgoshiHoldersがMCロールアウトへ伝播していなかった欠落も修正。
//   検証: 単体テスト16件全通過、実局面再現で馬→し切替を確認、SHI_TEAM=0で300配牌の着手列が
//   v171と完全一致(NULL等価性)、mixed-engine自己対戦600試合でz=0.00(winrate-neutral)。
// v173 (2026-08-13): Opus5レビュー(REVIEW_REPORT_shi_attack_v2.md)のMust-fix対応。
//   M-2: 新設「し攻め継続(チーム合計)」にshiUkiagariCertain(敵受け上がり確定)ガードを追加、
//   1手で局を献上しうる穴を修正。M-3: buryChoiceの伏せロジックを統合し、shouldShiAttackが
//   巡目に関わらず「し攻め進行中」の余剰判定(温存)を効かせるよう変更(2巡目以降の継続分岐が
//   担当する伏せが保護対象外だった穴を解消、重複コードも整理)。M-4: estimatePartnerShiの
//   撤回キャップが5し宣言(goshiHolders確定情報)まで潰していたのを、goshi由来のbaseには
//   適用しないよう修正(本機能が最も効くべきケースを殺していた)。M-5: receiveChoiceの新設
//   「乗る(チーム合計)」分岐を、計画書で明記した優先順位どおりし攻め拒否ルール群の後ろに
//   移設。M-1: 真のv171ベースラインとの直接比較(mixed head-to-head 250配牌×2、z=0.01)と
//   mc:true(実運用opts)でのNULL等価性(40配牌完全一致)を実施し、副次修正(goshiHoldersの
//   ロールアウト伝播)の実害なしを確認。M-6: 実装レポートの統計的誤り(選択バイアスにより
//   「相方3しで有意に悪化」としていた記述)を訂正。Must-fix対応後、選択バイアスを排した
//   対照付きA/B(意図的シナリオ、各400配牌×2)を再実施し、相方3し z=0.65(非有意)・
//   相方4し z=6.79(有意に改善)を確認。詳細はFIX_REPORT_shi_attack_v2.md参照。
// v174 (2026-08-14): Opus5レビューのNice-to-have(N-1〜N-7)を再レビューし、必要と判断した
//   3件を修正。N-2: receiveChoiceの新設「乗る(チーム合計)」のし枚数要件を、直上の既存分岐と
//   同じ動的しきい値(1+SHI_RIDE_KEEP、既定2)に統一(従来はハードコード>=2でSHI_RIDE_KEEP
//   変更に追随しなかった)。N-4: buryChoiceの「敵の5し続行→し温存」ルールに
//   !shouldShiAttack(...)の除外条件を追加。従来は敵に5し宣言者がいると、自陣もチーム合計で
//   し攻めしきい値を満たす局面(特にペア併存でcanShiAttackCが不成立のケース)でも無条件で
//   し温存(受け用)に回ってしまい、新しい伏せロジックに到達できなかった。N-5: ddClone
//   (ダブルダミーソルバー用クローン)がrejShi(し攻め拒否フラグ)をコピーしておらず、
//   estimatePartnerShiの拒否キャップ入力がDD探索経路でだけ欠落する不整合を修正
//   (cloneStateForRolloutは元々コピーしていた・ddCloneのみ欠落)。いずれもG/G_B両エンジンに
//   同一diff適用(diff hunk数は既存の意図的差分7件のみで変化なし)。N-1(統計手法): 以後の
//   A/B検証はペア和を1標本とする設計(同一配牌の2アサインメントの平均を取り、deal運の相殺分
//   だけSEを正しく縮小)に統一。N-3は前回(v173)のM-3対応で副次的に解消済み、N-6は実装
//   レポートのhunk数記載(9→7)を訂正、N-7は本ラウンドの検証スクリプトをoutputsに保存する
//   ことで対応。検証: 新設3ユニットテスト全通過(修正の意図した挙動をv173旧コードとの比較で
//   確認)、mc:false 400配牌+production-opts 150配牌でv173との着手列がいずれも100%一致
//   (今回の修正が稀な局面のみに影響する狭い修正であることを裏付け)、真のv171ベースラインとの
//   mixed head-to-head(250配牌×2、ペア和SE)でmean+0.36・SE=0.28・z=1.29(winrate-neutral)。
//   詳細はFIX_REPORT_nice_to_have_v174.md参照。
// v175 (2026-08-13): build v175反映 — PLAN_信頼値学習系統ブラッシュアップ_Fable5.md(Sonar依頼の
//   総合監査+改善計画、Planner=Fable5)の提案B/C/D/E/F/Gを実装(Sonnet5・実装レポート
//   IMPLEMENTATION_REPORT_信頼値学習系統ブラッシュアップ_Sonnet5.md参照)。appブロックが主体、
//   Gエンジンの変更はevLambdaのgE/gPゲート接続1箇所のみ(G/G_B同一diff、diff hunk数7で不変)。
//   【B・正しさ修正】観戦モード突入(app.humanSeat→null)時、エンジンに残留する人間席の学習状態
//   (OPP_PROFILE/OU_TRUST/CONV_TRUST/TBL_TRUST/kyoBias)をclearHumanLearningBothで明示クリア。
//   従来は観戦AIが直前の人間の学習済みプロファイルでモデルされ続けていた。研究モード
//   (humanSeat="S"を維持する設計)は対象外。
//   【C・既定OFF実験トグルEV_LAMBDA_GATE】oppRatesFromCountsのgE/gP確信度ゲート(計算されるのみで
//   消費先がROLLOUT_OPP経由のmodelRespActionのみ=既定OFFのため死値だった)をevLambdaへ接続。
//   ONにするとprofile注入直後(n=0近傍)の証拠強度が「従来のfallback」から「学習値」へ非連続に
//   ジャンプしていた挙動(相方攻めパスの尤度が証拠なし1.0→一律0.60等)を、確信度に応じた
//   滑らかな線形補間に置き換える。既定OFF(NULL等価)。
//   【D・既定OFF実験トグルKYO_RETENTION_LEARN】配線済み・供給ゼロだったG.setKyoRetention
//   (信念サンプリングの香温存κ補正)へ、auditOppProfileで新設した実測(app.oppCounts.ky、
//   G.komaLedgerのpHoldと実際の保有有無を比較するLaplace平滑化比推定)を注入する経路を追加。
//   合成プロキシ診断(diag_kappa_synthetic.js、実人間ログがないためのSonar裁定による代替検証)を
//   実施したところ、初版の「意図的バイアスへの感度不足」という結論は測定不備によるものと判明
//   (FIX/REVIEW Must-fix2): G.policyActionは元々182機会中168回(92%)が既にkoma!=="香"を選んで
//   おり、pKeepによる伏せ回避介入が実際に着手を変える余地はほぼ無い(実効線量ほぼゼロの実験
//   だった)ため、pKeep間のkappaHat差の大小から感度を論じることはできない。また中立条件で
//   観測されたkappaHat(raw)≈1.13というベースライン乖離も「AI自身の香温存傾向」ではなく、
//   エンジン内コメント(v116)に既に記載されているG.komaLedgerのpHold系統的過小評価(香で最も
//   顕著)が主因と判明: 駒種別Platt較正LEDGER_CAL_AB.香(a=0.9387, b=0.5055、production版
//   LEDGER_CALトグルは既定OFFのまま未変更)を分母(sumPredicted)に適用するとkappaHat(Platt較正後)
//   ≈0.97となり1に近づく(=κ≈1、計画の「実装不要」判定分岐に近い)。この訂正はdiag_kappa_
//   synthetic.jsとcalibration_harness.js双方に反映済み(dose実効線量カウンタ・Platt較正後
//   kappaHat出力を追加)。上記いずれの理由によっても新たな有効化根拠は得られていないため、
//   既定OFF維持の結論そのものは変わらない。app.oppCounts.kyには将来のスキーマ移行に備え
//   バージョンタグkyV:1を付与した。有効化はしていない(instrumentationのみ出荷)。
//   【E・裁定E1】CONV_TRUST/dcy汎用チャネルは意図的に非接続のまま(王合図の的中度を一般規約準拠へ
//   過剰一般化しない設計判断として明文化)。コード変更なし(コメントのみ)。
//   【F・既定OFF実験トグルLEARNING_RECOMPUTE】3系統のカウンタ累積方式(忘却なし・監査バグ時に
//   蓄積が全損する)を、保存済みallGames(直近K局、既定300)からの再集計方式に置き換え可能にする
//   recomputeLearningFromLogを追加。既定OFF時はJSONからの直接復元(従来どおり)でNULL等価。
//   【G・裁定】ROLLOUT_OPP/modelRespActionは当面現状維持(供給ゼロのまま温存)を既定判断とし、
//   裁定コメントを追加。
//   【A・診断】window.__learnTelemetry(局終了ごとの3系統+κのスナップショット記録、v157
//   ATK_OCC_TELEMETRYと同型)、および独立実行可能なオフライン較正ハーネスcalibration_harness.js
//   (index.htmlからGエンジンを都度抽出し、エクスポートしたcareer JSONを再生してκ・lamE/lamP/
//   bluff・convTrust系列・tbl較正・前半/後半の非定常性を診断するNode.jsスクリプト、出荷物とは
//   別ファイル)を追加。
//   検証: node --check(全9 script要素)全通過。G/G_B diff hunk数=7(不変、既存の意図的差分のみ)。
//   自己対戦NULL等価性(新トグル全既定OFF): mc:false基本設定461局・basic設定458局・strongティア
//   相当の深い探索設定(dd/attackMC/atkBand/matchEq/mcDets:96)57局のいずれも編集前v174と着手列が
//   完全一致(bit-for-bit)。naiveティアはMath.random()依存のため編集前後を問わずそもそも
//   非決定的であることを、旧コード同士の2回実行比較で確認済み(regressionではない)。app層の
//   新規関数(clearHumanLearningBoth/kyoRetentionVal/auditOppProfileのκ収集/
//   recomputeLearningFromLog等)はindex.htmlから該当コードをそのまま移植したNode単体テスト
//   (test_app_learning.js、FIX後11件全通過)で検証。recomputeLearningFromLogは同一ログ集合に対し
//   逐次蓄積方式と完全に同一の結果になることを確認済み。
//   実データでの再検証待ちの項目(既定OFFのまま出荷): C(Brier較正)・D(κ推定器の再設計要)・
//   F(K値の非定常性に基づく最終決定)。詳細はIMPLEMENTATION_REPORT参照。
// v176 (2026-08-20): build v176反映 — T1(最強AI)重みチェックポイント更新(Sonar提供の
//   t1_weights.js、sha256=b45552db...、旧: sha256=3243713d...)。データのみ差替、スキーマ
//   完全一致(encoder_version=v7s・d_model128/n_heads4/n_layers6・weights内149テンソルキー
//   集合が旧チェックポイントと完全一致・shi_clf fmt=5shi_adv_v2/hidden=32・v_match_300(30×30)
//   あり、いずれも旧チェックポイントとbyte-exactで完全一致)、t1_engine.js/t1_adapter.jsは無変更。
//   数値差分(base64→float32全数比較): 149テンソル中145個(97.3%)が変化、world_head/match_win_head
//   の4テンソルのみbyte-exactで不変。全パラメータ通しの相対L2変化量は約8.0%(終盤2層
//   encoder.layers.4/5・block_embeddings.14/15が最大、norm系は1%前後で最小、継続学習/
//   ファインチューン相当の規模)。
//   自己対戦A/B(duplicate pairing、G.js/t1_engine.js/t1_adapter.jsをNode単体に抽出し
//   同一配牌シードでNS/EW新旧checkpoint入替。当初200対=400局の簡易版で走らせたのち、
//   「厳密に実施」の指示によりv144方式の規模(1,338対)へ拡大再実施。さらに5し/五し
//   相談の投票を旧来のG簡易ヒューリスティックのままにしていた不備を修正し、T1席の
//   5し投票にT1AD.goshiVoteFull自身の判断を配線(goshiCheckT1Aware、本番のgoshiCheckT1Aware
//   と同一ロジックをharness側にも実装)。最終規模: 1,338対=2,676局。新チェックポイント
//   勝率50.64%(95%CI[48.74%,52.53%])、ペア化得点差平均+0.579点/対(SD=13.834、
//   SE=0.378、z=1.53)と有意差なし(winrate-neutral、旧より弱くなっていないことを確認)。
//   king/receive規約違反0件、配り直し(5し)318件を正常消化。チェックポイント再開可能な
//   harness(run_ab3.js、20対ごとにJSON checkpointへ保存)で計約132分・約14回の
//   フォアグラウンド実行に分けて完走。node --check(G.js/t1_engine.js/t1_adapter.js/
//   weights抽出分すべて)全通過、index.html本体側の差分はbyte-exactでT1Wデータ行(1行)+
//   直上のヘッダーコメント(1ブロック)のみ(他ブロックは無変更)であることを確認済み。
// v177 (2026-08-20): 手駒欄(#hand)が名札の残り枚数バッジより遅れて更新される不具合を修正
//   （報告: 「しを打っても、しが減らないように見える」— スマートフォンでの対局中、名札の
//   バッジは「残6」等に正しく更新されているのに、手駒欄には既に打ったはずの駒(し等)が
//   残ったまま表示され続ける）。原因調査: G.advance/removeOne自体は正しく手駒配列から
//   駒を取り除いており(単体検証済み)、onGameOver(K1(v79)修正で無条件renderHandTray呼び出し
//   あり)・resumeSavedMatch・395局の多様な自己対戦フルゲーム×人間席4パターン総当たりの
//   自動回帰でも再現せず。手詰まりの末、onHandTap(k)の設計自体に非対称なガード漏れがある
//   ことを特定: bury分岐は同期的にhumanTurn()を呼んで手駒欄を必ず再描画するのに対し、
//   attack/respond(受け)分岐は再描画をstep()内部のrenderHandTray(null)呼び出しに委ねており、
//   step()はapp.stopped/app.matchOver/app.review/app.tutorial.blockStepのいずれかが真だと
//   早期returnして再描画をスキップする。ところがonHandTap自身の入口ガードはapp.stoppedを
//   見ていないため、何らかの理由でapp.stoppedが真になっていても手駒のタップ自体は処理され、
//   applyAndLog→renderAll()（名札バッジは直後に更新）までは実行されつつ、その先のstep()だけが
//   無言でスキップされて手駒欄が古いまま取り残され得る非対称な穴があった(Playwrightで
//   app.stopped=trueを強制してこの穴を実際に再現・確認済み: バッジ「残6」/手駒欄7枚のズレ)。
//   対策: onHandTap()のbury/attack/respondの全3分岐で、applyAndLog+renderAll()の直後に
//   renderHandTray(null)を追加し、以降のどの分岐(終局・チュートリアル早期return・step()の
//   ガード等)に進んでも手駒欄が必ずタップ直後の真の手駒を反映した状態からスタートするように
//   変更(以降のhumanTurn()/step()/onGameOver()自身の再描画は従来どおり上書きで走るため無害)。
//   検証: node --check(全9 script要素)全通過。差分はonHandTap内3箇所へのrenderHandTray(null)
//   呼び出し追加(+コメント)のみ、他は無変更であることをdiffで確認。上記app.stopped強制再現
//   ケースが解消したことに加え、既存の全再現シナリオ(流れ/自分の最終手上がり/相手の受け上がり/
//   recvFinish/流局/resumeSavedMatch)および395局×人間席4パターン総当たり回帰を再実行し
//   全件一致(mismatch 0件、リグレッションなし)を確認。なお、report元の正確な再現手順は
//   未確認(利用者が手順を記憶しておらず、既知の到達可能な穴からの推定修正)であるため、
//   引き続き再発があれば追加調査を行う。
// v178 (2026-08-20): 「40点上がりして、振り返りで演出が出て、この演出が消えなくなる」報告を修正。
//   原因: 上がり点数
//   40点以上・同駒2倍・受け上がり等の特別演出(#wincut・キリコ)は、既定(fx="full")かつ
//   人間参加時はhold中(完了ボタン「#wc-done」押下待ち)になり、唯一のクローズ経路は
//   showWinCut内の_close()(#wc-doneのクリックハンドラ)のみで、自動消去タイマーは設定されない。
//   ところがonGameOver()は showWinCut()/kirikoBurn() 呼び出しの直後、同じアクションバーに
//   「振り返り」ボタン(および結果を見る=showMatchEnd)を即座に表示しており、完了ボタンを押す
//   前にそちらを押すとopenReviewOn()/showMatchEnd()のどちらも演出のクリーンアップを一切
//   行わないため、演出(キリコの炎・提灯・#wincutカード)が振り返り/結果画面の上に残留した
//   まま二度と消えなくなっていた。対策: openReviewOn()冒頭とshowMatchEnd()冒頭で、
//   showWinCutの_close()と同等のクリーンアップ(clearTimeout(app._wcT)・kirikoRelease(true)・
//   #wincutのshow/outクラス除去)を先に行うよう変更。kirikoRelease()はhold中でなければ
//   内部で無害にno-opするため、演出が出ていない通常の振り返り/結果表示には影響しない。
//   検証: node --check(全9 script要素)全通過。差分はopenReviewOn/showMatchEndの各冒頭への
//   3行+コメント追加のみ(他は無変更)であることをdiffで確認。Playwrightで「40点上がり
//   (hold中)→振り返りを開く」を再現し、修正前はkiriko-fireの show/hold クラスと#wincutの
//   showクラスが振り返り画面表示後も残留すること、修正後はいずれも正しく解除され振り返り
//   画面のみが表示されることを確認。既存の全再現シナリオおよび395局×人間席4パターン
//   総当たり回帰を再実行し、全件一致(リグレッションなし)を確認。
// v179 (2026-08-20): 「開幕いきなり双方0点で負けている」報告への防御的対策。
//   報告: 対局中のスクリーンショットで、第1局・双方0対0のまま「敗北 — 相手組の勝ち」の
//   マッチ終了モーダルが表示されていた。原因調査: showMatchEnd()の呼び出し元
//   (onGameOver/onSpecialYaku/endPractice/rv-closeハンドラの4箇所)はいずれも
//   over=(app.scores.NS>=app.cfg.target || app.scores.EW>=app.cfg.target)を事前に
//   正しく確認してからボタンを表示しており、また「もう一勝負」(newMatch())で
//   マッチ終了モーダル表示中にscoresが0/0へリセットされた後にshowMatchEnd()が
//   再度呼ばれるような経路もPlaywrightでの再現テストでは確認できなかった。利用者も
//   直前の操作を記憶しておらず、正確な誤呼び出し経路は未特定のまま。
//   一方でshowMatchEnd()自体のロジックに実害のある欠陥を発見: 勝者判定が
//   `nsWin = app.scores.NS >= app.cfg.target` の真偽だけで行われ、falseの場合は
//   無条件に「EW(相手組)の勝ち」と表示する片側だけの判定になっていた。本来
//   showMatchEnd()はover=trueの時にしか呼ばれない前提のためこれで正しいはずだが、
//   その前提が何らかの経路(未特定)で崩れて誤って呼ばれた場合、NS・EWのどちらも
//   targetに未到達(例: 0対0)であっても「相手組の勝ち」という偽の敗北画面を
//   表示してしまう。対策: showMatchEnd()冒頭で NS>=target || EW>=target を
//   再検証し、どちらも満たさなければ誤呼び出しとみなしてconsole.warnで
//   状態(NS/EW/target/gameNo)を記録した上で、モーダルを開かず・app.matchOverも
//   立てずに何もせず抜けるガードを追加(既にディールされている盤面はそのまま
//   操作可能な状態で残る)。根本原因(誤呼び出しそのものの経路)は未特定のため
//   対症療法だが、報告された症状(偽の敗北/勝利表示)自体は確実に防止できる。
//   検証: node --check(全9 script要素)全通過。差分はshowMatchEnd()冒頭への
//   ガード追加(+コメント)のみ、他は無変更であることをdiffで確認。Playwrightで
//   (a) NS=EW=0の状態でshowMatchEnd()を呼ぶと誤呼び出しとして抑制されモーダルが
//   表示されないこと、(b) NS側が正当にtargetへ到達した場合・(c) EW側が正当に
//   到達した場合はいずれも従来どおり正しく結果画面が表示されることを確認。
//   既存の全回帰シナリオおよび395局×人間席4パターン総当たり回帰を再実行し、
//   全件一致(リグレッションなし)を確認。
// build v180: 受けMCロールアウト層の逐次適応サンプリング(MC_ADAPT)導入・既定OFF。
//   計画: PLAN_MC_ADAPT_v2_Opus5.md(Opus5、レビューREVIEW_REPORT_MC_ADAPT計画_Sonnet5.mdの
//   Must-fix5件を実測データで解消した改訂版)。実装・検証: Sonnet5、
//   IMPLEMENTATION_REPORT_MC_ADAPT_Sonnet5.md参照。base=v179。
//   対象: index.htmlのmcDecideReceive(G/G_B共通ブロック)のロールアウトループのみ。app層は無改変。
//   実装: DD_ADAPTと同型のモジュールスコープ・グローバルフラグ(MC_ADAPT、opts経由ではない)で、
//   BASE=32標本→上位2候補の対標本z検定(|z|<Z=1.64で非有意なら)BLOCK=16ずつMAX=288まで逐次延長。
//   MIN_DETS=96ゲートで実対局トリオ(tierOpts strong/adviceOpts/candidateRanking)のみに適用範囲を
//   限定し、ouTakeTurnPick(32)・aiHesitation(14)・振り返り(24)は従来固定のまま不変。
//   既存dd/DD_ADAPT経路とは実測で完全排他(0/1,336件が同時成立・コード上もdets=0でMIN_DETSを
//   下回るため構造的に排他)。三者一致はapp層無改変のグローバルフラグ方式で構造的に担保。
//   検証結果(実装フェーズ・IMPLEMENTATION_REPORT_MC_ADAPT_Sonnet5.md参照):
//   - node --check: 9 script要素すべて通過。
//   - NULL等価性(MC_ADAPT=0): 着手列SHA-256完全一致(strong構成10マッチ・1,875手)、
//     selfTest(30,{mc:false})・selfTest(8,strong構成)ともJSON完全一致(G・G_B両方)。
//   - byte-exact diff: index.htmlの差分は計画§5.0の8箇所のみ(7 hunks in index.html + sw.js)。
//   - G/G_Bの追加行は逐語同一(機械確認)。
//   - 三者一致(UI実地・Playwright): 実対局AI(tierOpts strong)≡推奨手(getRec→moveHint)が
//     220/220局面で一致(MC_ADAPT=1)。決定論性: 同一局面2回評価が70/70完全一致。
//   - 排他性: usedDD===trueの局面でmcN===0が1,336件中0件の例外(exclusivity違反ゼロ)。
//   - 小予算経路(mcDets 14/24/32・MIN_DETS=96ゲート): MC_ADAPT 0/1間で180件中0件のbyte不一致。
//   - 境界テスト: cands<2の安全な undefined 返却・MAX<BASE時のMath.maxガード・無限ループなし
//     (最大レイテンシ227ms)を確認。
//   - 自己対戦audit(王攻め違反・受け合法性違反・駒保存則・stuck): 単体selfTest(915局)+
//     mixed-engine A/B(5,329局)の合計6,244局すべてで0件。
//   - Phase1精度再現(独立サンプルn=750局面・576決定化split-half): 固定96=89.20%→
//     MC_ADAPT=92.93%(+3.73pt、McNemar z=3.61)。平均決定化数100.9(既定基準の95〜105以内)。
//     受け入れ基準10(+3.0pt以上・z≥2.58)・基準11前半(平均決定化110以下)をいずれも満たす。
//   - レイテンシ実測: mcDecideReceive単体+7.7%、フルマッチ平均+8.6%
//     (基準11後半の+15%以内は満たすが、計画書のプロトタイプ実測(-1.2〜-1.9%)より悪化しており
//     要注視。原因未特定・今回のサンプルでの実測値をそのまま報告)。
//   - Phase2 A/B(mixed-engine head-to-head、365ペア/5,329局・計画目標6,000ペアの一部):
//     新エンジン勝率51.23%(95%CI[47.61%,54.86%])、ペア化得点差 平均+7.78pt/ペア(z=2.92・有意)。
//     勝率のCI下限が49.0%を下回るため受け入れ基準12は現サンプル数では「既定ON」条件を
//     満たさない(点推定・得点差検定は改善方向だが、6,000ペア規模での確証的再測定が必要)。
//   - Phase3(協調性指標)は今回未実施(follow-up)。
//   結論: MC_ADAPT既定0(OFF)でのマージ条件(基準1〜7)はすべて満たすため本ビルドは安全に配信可能。
//   既定ON化(基準8〜13)は基準8・9・10・11を満たすが基準12(勝率)・13(協調性)が未確証のため、
//   今回はMC_ADAPT=0のまま配信し、大規模A/B確証後に既定ON化を再検討する。
// build v181: MC_ADAPT既定ON化。コード変更は index.html の MC_ADAPT 初期値 0→1 の
//   1トークンのみ(G/G_B両ブロック、計2箇所、byte-exact diffで確認済み)。
//   経緯: IMPLEMENTATION_REPORT_MC_ADAPT_Sonnet5.md の受け入れ基準(§8.2)のうち
//   基準8・9・10・11は満たしていたが、基準12(A/B勝率)は644ペア(目標6,000ペアの
//   約11%、本サンドボックスでのバックグラウンド長時間実行不安定のため未達)の
//   時点で有意差を検出できず「判定不能」のまま、Sonnet5は既定OFF配信を推奨していた。
//   Sonarはこの説明(A/B勝率の検出力不足、EVリグレット48.4%削減(t=3.52)・
//   オラクル一致率+3.73pt(McNemar z=3.61)という判断の質を測る指標は明確に支持
//   している旨)を確認した上で、既定ONへの切替を明示的に指示。レビューア推奨の
//   6,000ペア確証待ちに対するSonar自身の上書き判断であり、経緯を記録する。
//   MC_ADAPT=1状態での安全性・三者一致・決定論性・自己対戦audit(9,347局超で
//   違反0件)は既に検証済みで、フラグ初期値の変更自体に新規リスクは無い。
//   切り戻しは1トークン(MC_ADAPT=1→0)またはG.setMcAdapt(0)で即座に可能。
// build v182: 振り返り画面の「読み切りの逃し」誤検出バグ修正(computeCoach、index.html 1箇所のみ)。
//   経緯: Sonarが実対局(第5局・第4勝負・手24 自分伏せ「香」)で、勝ち確定局面にも関わらず
//   「AIなら伏せ「金」（Solver証明あり — 30点の確実な上がり手順を読み切り）」という⚠が出る事象を
//   報告し検証を依頼。共有URL(局面share機能)から得た実データをNode上で本番コード(G.js抽出版)に
//   直接通し、freshSolverProbeとddParAnalyzeの実測値を確認した。
//   根本原因: computeCoachの「別手順でも同点なら逃しにしない」判定(旧実装)が、人間の手の
//   ddParAnalyze評価値を par.rows[0].v(全伏せ候補中の絶対最善値)と比較していた。本局面では
//   freshSolverProbeの推奨手「金」(worst-case前提での確実な30点)自体がddParAnalyzeの絶対最善
//   ではなく(絶対最善は伏せ「銀」の40点。真の手駒を使った二重盲探索でのみ判明する値で、
//   worst-case解は不可視駒の所在によらず安全な手しか「確実」と認めないため銀の40点ラインは
//   証明できない)、人間の実手「香」は「金」と完全に同点(共にddParAnalyze値30)であるにも
//   関わらず、絶対最善(40)との差(10点 > 0.5点閾値)により誤って「読み切り逃し」と判定されていた。
//   検証: solveWinの候補探索を手動列挙し、伏せ「金」「銀」「香」がworst-case確実勝ちとして
//   全て同点30であることを確認。ddParAnalyzeの実行結果も 銀40/角30/金30/香30 で、香と金が
//   厳密に同点であることを独立に確認済み(信頼度5/5・実データ・実コードでの直接再現)。
//   修正: 比較基準をpar.rows[0].v(絶対最善)からprobe.move(AIの推奨手)自身のddParAnalyze値に
//   変更。「AIの推奨手と同点かどうか」を正しく判定するようにした(index.htmlのみ、G/G_Bエンジン
//   本体には変更なし。MC_ADAPTとは無関係で、v180/v181双方に存在していた既存バグ)。
// build v183: 信念モデル(passViolates)の王温存パス証拠誤判定を修正(既定OFF、PASS_OU_KEEP=0)。
//   計画: PLAN_信念モデル2巡目以降王温存未考慮_Opus5.md。詳細はindex.htmlのbuildコメント参照。
// build v184: v183のPASS_OU_KEEP(免除方式)をpassFactorによる較正λ(段階的減衰)方式へ置き換え。
//   計画: PLAN_案D_較正λ_王温存パス証拠_Opus5.md(既定OFF、PASS_OU_LAM=0/PASS_OU_HUM=0)。
//   詳細はindex.htmlのbuildコメント参照。実装前提のλ定数はExecutorによる独立再測定
//   (検証レポート_Phase0地上真実追試の不一致_Sonnet5.md)で計画書§0.5から一部置き直している。
// build v185: 案D(較正λ)を既定ONへ昇格(PASS_OU_LAM=2/PASS_OU_HUM=1)。ロジック変更0行、
//   既定値declaration4箇所のみ変更。検証・昇格判断の経緯はindex.htmlのbuildコメントおよび
//   IMPLEMENTATION_REPORT_案D_較正λ_王温存パス証拠_build_v184_Sonnet5.md参照。
const CACHE_NAME = "goita-v185";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        // 個別に addAll すると1件の失敗で全体が失敗するため、可能な限り耐性を持たせる
        await Promise.all(
          PRECACHE_URLS.map(async (url) => {
            try {
              await cache.add(url);
            } catch (e) {
              // 1リソースの取得失敗でinstall全体を失敗させない
            }
          })
        );
      } catch (e) {
        // プリキャッシュに失敗してもSW自体のインストールは継続させる
      }
    })()
  );
  // skipWaiting() は意図的に呼ばない
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("goita-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      } catch (e) {
        // 削除失敗は無視(次回activateで再試行される)
      }
      try {
        if (self.clients && self.clients.claim) {
          await self.clients.claim();
        }
      } catch (e) {
        // ignore
      }
    })()
  );
});

// index.html / ナビゲーションリクエスト: network-first + cache fallback
async function networkFirstHTML(request) {
  try {
    const fresh = await fetch(request);
    try {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, fresh.clone());
    } catch (e) {
      // キャッシュ書き込み失敗は致命的ではない
    }
    return fresh;
  } catch (e) {
    // オフライン等: キャッシュへフォールバック
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached =
        (await cache.match(request)) ||
        (await cache.match("./index.html")) ||
        (await cache.match("./"));
      if (cached) return cached;
    } catch (e2) {
      // ignore
    }
    throw e;
  }
}

// Google Fonts: stale-while-revalidate
async function staleWhileRevalidateFont(request) {
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch (e) {
    // キャッシュが開けない場合はネットワークへそのまま委ねる
    return fetch(request);
  }

  const cached = await cache.match(request).catch(() => undefined);

  const networkFetch = fetch(request)
    .then((response) => {
      try {
        if (response && response.ok) {
          cache.put(request, response.clone()).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // キャッシュを即返しつつ、裏で更新(結果は次回以降に反映)
    networkFetch;
    return cached;
  }

  const network = await networkFetch;
  if (network) return network;

  // キャッシュもネットワークも無い場合は失敗させる(呼び出し側でcatch)
  throw new Error("font fetch failed and no cache available");
}

self.addEventListener("fetch", (event) => {
  try {
    const request = event.request;

    // GET以外は素通し(POST等をキャッシュ層で扱わない)
    if (request.method !== "GET") return;

    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return; // 解析できないリクエストは素通し
    }

    const isSameOrigin = url.origin === self.location.origin;

    if (isSameOrigin) {
      // 同一オリジンのナビゲーション/index.html は network-first
      const isNavigation = request.mode === "navigate";
      const path = url.pathname;
      const isIndexHtml =
        path.endsWith("/index.html") ||
        path === "/" ||
        path.endsWith("/");

      if (isNavigation || isIndexHtml) {
        event.respondWith(networkFirstHTML(request));
        return;
      }

      // その他の同一オリジン資産(manifest.json/アイコン等)はキャッシュ優先→ネットワーク
      event.respondWith(
        (async () => {
          try {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            if (cached) return cached;
            const fresh = await fetch(request);
            try {
              cache.put(request, fresh.clone());
            } catch (e) {
              // ignore
            }
            return fresh;
          } catch (e) {
            return fetch(request);
          }
        })()
      );
      return;
    }

    // cross-origin: Google Fonts のみ対象
    if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
      event.respondWith(
        staleWhileRevalidateFont(request).catch(() => fetch(request))
      );
      return;
    }

    // それ以外のcross-origin(外部リンク等)はSWで一切触らない
    return;
  } catch (e) {
    // fetchハンドラ内の想定外エラーはネットワークへの素通しに委ねる(respondWithしない)
    return;
  }
});
