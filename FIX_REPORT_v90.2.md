# 修正レポート v90.2 REVIEW対応

- Fixer: Sonnet5（goita-dev-loop フェーズ4）
- 対象: `REVIEW_REPORT_v90.2.md`（Reviewer: Fable5）のMust-fix 2件
- 方針: Must-fixのみ対応（便乗修正禁止）。Nice-to-have 5件は未対応のまま記録。

## 対応した指摘事項

### 1. showYakuSplashのチーム名が旧表記のまま（index.html）

- 指摘: `const teamJa = sp.team === "NS" ? "南北" : "東西";` が残存し、対局中の手役スプラッシュに「自分・南北組」という新旧混在表記が出ていた。`onSpecialYaku()`は既に`teamDisp()`化済みで、同一イベントの表示が画面内で食い違っていた。
- 対応: `teamJa`を`teamDisp(sp.team)`に置換。`teamDisp`は対局中（`humanSeat`あり）は「あなた組/相手組」と既に「組」を含むため、`eSeat.textContent`の組み立てを`seatJa + "・" + teamJa + (app.humanSeat ? "" : "組")`に変更し、観戦時（方位名のまま）のみ「組」を手動付与する形にした（レビュー提案どおり）。
- 再検証結果: 新規`test_review_fixes.js`で(a)対局中: `showYakuSplash({seat:"S",team:"NS",...})`実行後、`#ys-seat`のtextContentが「自分・あなた組」（「組組」の二重付与なし・「南北」の残存なし）であることを断言、(b)観戦時（`humanSeat=null`）: 同様に「北・南北組」（「組」の付与漏れなし）であることを断言。両方PASS。

### 2. F-1後片付けタイマーが演出「短め」で配牌アニメを途中切断（index.html）

- 指摘: `setTimeout(dealCleanup, fx().dealMs + 250)`は`FX.short`（dealMs=350ms）では600msに発火するが、最終駒（4席目・8枚目）のアニメ完了は`dealDelayMs`最大570ms + `--dur-move`(300ms) = 870msであり、発火時点でまだアニメ中の駒から`.deal-in`が剥がれて瞬間スナップする視覚リグレッションがあった。`min`は演出無効、`full`（950ms）はたまたま870msを上回り安全だったため、既存のfxLen=minのみの回帰確認では検出されなかった。
- 対応: レビュー提案のとおり、発火時刻を実アニメ完了時刻の理論値と比較して大きい方を採用するよう変更:
  ```js
  const maxDealAnimMs = (dealSeatOrder().length - 1) * 120 + 7 * 30 + 300;   // 300ms = --dur-move
  app._dealCleanupT = setTimeout(dealCleanup, Math.max(fx().dealMs, maxDealAnimMs) + 250);
  ```
  `dealDelayMs`側のスケーリングは既存のC-1見た目を変えるため行わず、後片付けタイマー側の待ち時間だけを補正する非破壊的な修正とした。
- 再検証結果: 新規`test_review_fixes.js`で、`full`/`short`/`min`の3プリセットそれぞれについて機械検査を実施。(1)理論完了時刻(870ms)の50ms手前ではまだ`.deal-in`が残っていること（＝アニメ途中で剥がれていないこと）、(2)十分待てば（完了+250ms超）後片付けが完了していること、の両方をfull/shortで断言（minはタイマー自体が発火しないことを確認）。全PASS。

## 対応しなかった指摘事項

Nice-to-have 5件（対訳表#1の左右表記・showJosekiExampleの観戦時不統一・復帰カードのteamDisp化・boardSummaryTextの重複実装・F-3の受け公開しの定義）は、レビューの「フェーズ4への引き継ぎ」指示（Must-fixのみ対応・便乗修正禁止）に従い、今回は対応していません。次回のご指示があれば別コミットで対応します。

なお逸脱4（凡例・席構成パネル・livebar説明の据え置き、研究モードstatus行の類推判断）は「Sonar裁定待ち」としてレビューでも保留扱いのため、本コミットでは変更していません。

## 再検証結果（総合）

- **構文**: 4つの`<script>`ブロック全てで`node --check`合格。
- **回帰**: 既存`test_f1.js`/`test_f2.js`/`test_f3.js`（計18アサーション）を再実行し全PASS。
- **新規**: `test_review_fixes.js`（Must-fix1×2ケース＋Must-fix2×3プリセット、計5アサーション）全PASS。
- **byte-exact**: `G`/`G_B`/`saveCareerToStorage()`/`loadCareerFromStorage()`を`goita-app-v90b.zip`基準と再比較し、完全一致を確認（両修正ともUI層のみで影響なし）。
- **禁止語彙**: 出力DOM（`<script>`/`<style>`除去後）に対し指定11語彙＋「サボ」のgrepが0件であることを再確認。
- **CACHE_NAME**: レビューの裁定（「v90.2未配布の前提なら同一デプロイ単位」）に従い、`v103`のまま据え置き。
- **buildコメント**: `index.html`先頭に本レビュー対応の内容を追記済み。

## 未実施（デプロイ前に必要な確認、レビューの指摘どおり）

- 実機確認2件（F-1の見た目・F-2の名札一覧）
- 実ブラウザでのaxe-core 4テーマ再スキャン
