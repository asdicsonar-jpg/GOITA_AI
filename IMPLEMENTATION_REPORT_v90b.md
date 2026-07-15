# 実装レポート v90b「卒業」

- Executor: Sonnet5
- 対象計画: `PLAN_v90_teacher.md`（改訂3版）v90b セクション（G-1〜G-3）
- 基準ファイル: v90a納品版（`goita-app-v90a.zip`、index.html 16,196行・`CACHE_NAME="goita-v97"`）
- 成果物: index.html 16,212行・`CACHE_NAME="goita-v98"`

## 1. 実施した変更

### G-1: SCAFFOLDSテーブル定義
既存の `COACH_FLAGS` と実在する `cfg-*` トグルから機械的に導出した10件の足場テーブルを新設（`key`/`sc`（T-0の対局スタンプ符丁）/`order`/`label`/`concept`/`def`）。`advice`（推奨手の提案）は含めるが、その従属機能である `cand`（候補手表示）は含めない。`sighonest`（対局後監査専用）も対象外。`concept` を持つ足場（`missGuard`→uke, `counts`→kyo, `riverseq`→kyo, `tempo`→read, `explain`→read, `reading`→read）は既存の学習者モデル（`conceptMastery`/`buildConceptProfile`、T-2で非同期化済み）と接続し、`concept:null` の足場（`assistHi`/`advice`/`livebar`/`hints`）は `app.career` の直近成績（ヒント不使用局のみ）で判定する。

### G-2: 卒業判定「試し」方式（propose/trial/judge）
`goita_grad_v1` を新設し、`{trial, cooldown, graduated}` を永続化。

- **propose**: 足場がON・習熟度が閾値（concept系0.70／career系0.65、いずれもサンプル数下限あり）以上・クールダウン外（提案却下から5局未経過は除外）の条件を満たす最初の足場を提案。
- **trial**: 「試す」選択で該当足場を即OFFにし3局計測を開始。T-0のスタンプ（`app.rec.sc`）で手動再ON（=中断）を検知し、検知時は試行を破棄してクールダウンへ。
- **judge**: 3局終了時に一致率を集計し、閾値以上なら `graduated` へ記録、未満なら `failed_pending` として「戻す/このまま続ける」の選択をkeiko札で提示。**試行3局は成績（`app.career`）に算入する**仕様（Sonarの既定方針どおり実装・テスト済み）。

`keikoProposeGrad()` はT-2確立済みの非同期キャッシュパターン（`keikoEvalGradAsync()` → `requestIdleCallback`/`setTimeout(30)`フォールバック → `app._gradProposalCache`）に従わせた（詳細は「2. 計画からの逸脱」参照）。keiko札は既存の `#keiko-desc`/`#keiko-diag`/`#keiko-action`/`#keiko-dismiss` を流用し、優先順位は 1:SRS(v90c予定stub) 2:卒業提案(本コミット) 3:弱点ドリル(v90a) のまま。

### G-3: 卒業帳（`openCareer()` 内セクション）
`openCareer()` のモーダル本文に「卒業帳」セクションを追加。SCAFFOLDS全10件を「使用中／試し中（n/3局）／✓ 外した（日付）／未使用」で一覧表示し、`advice` の下に従属関係（候補手・難度バッジ）を注記として表示。残りON数から「大会仕様まであと n つ」を算出して表示。色は `--aoi`（情報系）のみ使用し、`--kin`/`--shu` は不使用（配色憲章§1準拠）。

### sw.js
`CACHE_NAME` を `goita-v97` → `goita-v98` に更新。

## 2. 計画からの逸脱

1. **G-2評価の非同期キャッシュ化（未明記の設計判断）**: 計画には明記がありませんが、実装中に2件のTDZ（一時的死域）エラーを検出したため、T-2で確立済みのパターンに合わせて対処しました。詳細は下記「3. 検証結果」および「4. 既知の懸念点」を参照してください。行動としては安全側（初回描画をブロックしない、というT-2の受け入れ基準を卒業提案にも一貫適用）と判断していますが、計画外の設計拡張である点はご確認をお願いします。
2. **SCAFFOLDS/G-2モジュールの配置場所**: 実装当初は計画の記述順どおりT-1/T-2のコメントブロック付近（1のTDZ回避のため）に配置しましたが、`scaffoldStamp()` 定義直後（ファイル前方）へ移動しました。挙動に影響するコード順序変更ではなく、関数定義の巻き上げ順序を整えるための移動です。移動後、他の関数定義の実行順序に影響がないことをテストで確認済みです。
3. **CACHE_NAME**: v90aの繰上げ（v96→v97）を踏襲し、v98としました（計画書はv90bをv97としていましたが、v90a報告時の繰上げに合わせて連番を維持）。

## 3. 検証結果

- **単体動作確認（jsdom, 16ファイル・全PASS）**: `test_g1.js`（SCAFFOLDS内容・定義漏れなし）／`test_g2_propose.js`（提案条件a〜e・優先順位・クールダウン）／`test_g2_trial.js`（試し開始→スタンプOFF検知→中断／3局計測→卒業／failed_pending→戻す・続ける）／`test_g2_stats.js`（試行3局のcareer算入）／`test_g2_wording.js`（keiko札の文言・配色）／`test_g3.js`（卒業帳の表示ロジック・従属注記・残数計算）に加え、既存の `test_smoke/t0〜t5/ongame/settings_hook/misc_hooks.js` を再実行し全PASS（v90a機能への回帰なし）。
- **byte-exact確認**: `G`/`G_B` エンジンIIFEを波括弧深度で抽出し、v90a基準と完全一致を確認（`G`: 3,481行一致、`G_B`: 3,492行一致）。エンジンコアは無改変。
- **axe-core構造的検証**: keiko札の卒業提案カード（`grad_propose`）・卒業判定カード（`grad_failed`）・`openCareer()` 内の卒業帳を実際にレンダリングした状態で、yoai/kinari/hc/CUDの4テーマにわたり `axe.run()` を実行。結果は `region`（moderate, 19ノード）が4テーマとも検出されましたが、これはv90a報告時点と同一ノード数であり、v90bの新規要素（keiko札の新カード種別・卒業帳セクション）による**新規違反の追加はゼロ**です。加えて `aria-dialog-name`（serious, 1ノード）が検出されましたが、これは `openCareer()` が呼び出す共通の `modal()` ヘルパー（`role="dialog"`+`aria-modal="true"` を設定するが `aria-label` を設定しない、全モーダル共通の既存仕様）に起因するものであり、v90bが追加した卒業帳の内容（`gradLedgerHtml()` は本文HTMLを `body +=` するのみで `modal()` 呼び出しやARIA属性には一切触れていない）とは無関係のpre-existingな未対応事項です。v90aの検証ではopenCareer()系の画面を実際に開いてaxeスキャンしていなかったため今回初めて顕在化しましたが、原因はモーダル基盤の既存仕様であり、本コミットのスコープ外と判断しています。
- **禁止事項の機械確認**: 出力DOM（`<script>`/`<style>`除去後のbody、keiko札の卒業カード表示中・卒業帳表示中を含む）に対し、指定11語彙（連続日数,日連続,ストリーク,ポイント,コイン,経験値,レベルアップ,達成率,トロフィー,実績解除,ログインボーナス）のgrepが4テーマとも**0件**であることを確認。ゲーミフィケーション的表現（バッジ演出・連続日数訴求等）は不使用。

## 4. 既知の懸念点

1. **G-2評価の非同期キャッシュ化の経緯（詳細）**: `SCAFFOLDS` は当初T-1/T-2コメントブロック付近に配置しましたが、起動時の同期呼び出し連鎖（`renderKeikoPanel()`→`keikoProposeGrad()`→`gradPropose()`）がこの定義より前に実行され `ReferenceError` が発生しました。`scaffoldStamp()` 直後への移動で解消しましたが、続けて concept系足場の判定（`gradMasteryFor()`→`buildConceptProfile()`）が今度は `CONCEPTS`（DRILLS/TUT領域で定義、依存が深く移動はリスクと判断）のTDZに抵触しました。`CONCEPTS` 自体の移動ではなく、T-2と同一の非同期キャッシュパターンへ卒業提案評価を全面的に合わせる形で解決しています（`keikoProposeGradCompute()`で重い計算を行い、`app._gradProposalCache`へ格納、`keikoProposeGrad()`は同期的にキャッシュを読むだけ）。挙動としては「初回描画をブロックしない」というT-2の既存受け入れ基準を卒業提案にも適用した形になり、性能面でも安全側だと考えていますが、計画に明記のない設計拡張である点、レビューで重点的にご確認いただきたいです。
2. **`aria-dialog-name`（axe-core, serious, 1ノード）**: 上述の通り `modal()` ヘルパー共通の既存仕様であり、卒業帳固有の問題ではありません。修正は本コミットのスコープ外としましたが、`openCareer()` に限らず全モーダル画面に影響するため、別途対応の要否をご判断ください。
3. **R-b5（`hints` OFF時の操作可能性）**: 計画書が明示するとおりjsdomでは検出不能な項目です（操作ヒントOFF状態でのUI操作性は視覚的・体感的な確認が必要）。手動確認をお願いします。
4. **v89安定10テストの再構築**: v90a報告から継続の懸案で、未対応です。

## 5. 受け入れ基準チェック表

| # | 基準 | 結果 |
|---|---|---|
| 1 | SCAFFOLDS: cand/sighonestを含まない10件、concept紐付け正しい | ✓ |
| 2 | 提案条件a〜e（ON・閾値以上・サンプル数下限・クールダウン外・trial中でない）を満たす最初の足場のみ提案 | ✓ |
| 3 | 試し開始で即OFF・3局計測・手動再ON検知で中断 | ✓ |
| 4 | 試行3局はcareerに算入される | ✓ |
| 5 | judge: 閾値以上→graduated記録、未満→failed_pending（戻す/続ける選択） | ✓ |
| 6 | keiko札は既存DOM流用・優先順位維持・配色は`--aoi`のみ | ✓ |
| 7 | 卒業帳: 全10件の状態表示・advice従属注記・残数表示 | ✓ |
| 8 | エンジン(G/G_B)無改変（byte-exact） | ✓ |
| 9 | axe-core構造的違反の新規追加ゼロ | ✓（region: v90aと同数19、aria-dialog-nameはmodal()共通の既存仕様） |
| 10 | 禁止語彙ゼロ | ✓ |
| 11 | CACHE_NAME → goita-v98 | ✓ |

以上、v90bの実装・検証が完了しました。ご確認のうえ、v90c着手のご指示をお願いします。
