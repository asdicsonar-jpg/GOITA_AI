# 修正レポート — REVIEW_REPORT_v90abcde.md 対応（goita-dev-loop フェーズ4）

- Fixer: Sonnet5
- 対象: `REVIEW_REPORT_v90abcde.md`（Reviewer: Fable5、総合判定「要修正」・Must-fix 3件）
- 基準ファイル: `goita-app-v90e.zip`（index.html 16,710行・`CACHE_NAME="goita-v101"`）
- 成果物: index.html 16,738行・`CACHE_NAME="goita-v102"`

## 対応した指摘事項

### I-1. `app._scAtStart` が2つの対局入口で未設定

**指摘**: `resumeSavedMatch()`（旧L9577）・`resumeFromMove()`（旧L14454）がいずれも `_scAtStart` を設定せず、`scaffoldStamp()` の `_scAtStart || app.cfg` フォールバックにより終局時点のcfgがそのまま刻印され、T-0の安全側規則（局中ONへ変更は引き上げ、OFFへの変更は引き下げない）が再開局・巻き戻し局で無効化されていた。

**対応**: 両関数に `app._scAtStart = {...app.cfg};` を追加した。

- `resumeSavedMatch()`: `phase === "live"` 分岐内、`app.rec = rec;` の直後（`wakeLockAcquire()` の前）。`phase !== "live"`（局間再開）の分岐は既存どおり内部で `startGame()` を呼ぶため、`startGame()` 自身が持つ既存の `_scAtStart` 設定で正しくカバーされており、追加は不要と判断した。
- `resumeFromMove()`: `app.lastRec = null;` の直後、`closeReview();` の前。

**再検証**: `test_t0.js` に2件のテストケースを追加した。(1) `_scAtStart = null` にリセットして「再読込直後」を模し、`resumeSavedMatch()`（live phase）を呼んだ後 `_scAtStart` が resume 時点の cfg のスナップショットになっていることを確認。(2) 同様に `resumeFromMove()` についても確認。両ケースとも修正前は `_scAtStart` が `null` のまま残ることを手元で確認した上で、修正後にPASSすることを確認した。

### I-2. 卒業提案の `concept:null` 判定が `hinted` 局を除外

**指摘**: `gradMasteryFor()`（旧L9447）の `const eff = app.career.filter(c => !c.hinted);` により、`assistHi`/`advice` がONの局（＝毎局 `hinted` が立つ）だけを行うユーザーの `eff` が永久に空になり、`order1`（assistHi）・`order2`（advice）が「はじめて」プリセット常用者に対してだけ提案されない逆転が生じていた。

**対応**: `hinted` によるフィルタを撤去し、`app.career` の全エントリで一致率を算出するよう変更した。関数冒頭のコメントに、この変更の理由（openCareer() の近況表示用 `eff` とは意図的に別ロジックであること、上振れは「試す価値」ゲートの趣旨として許容し実力の最終証明は試行3局が担うこと）を明記した。

**再検証**: `test_g2_propose.js` に新規ケース「全局 `hinted=true`・高一致率のユーザーに対し `gradPropose()` が `assistHi`（order1）を返す」を追加した。修正前にこのテストを実行すると `gradPropose()` は `null` を返す（`eff` が空のため `gradMasteryFor()` が常に `null`）ことを確認した上で、修正後にPASSすることを確認した。テスト追加時、後続の condition-e（クールダウン）ケースが暗黙に依存していた cfg 状態（`tempo`/`explain`/`reading`/`hints` がONのままである前提）を新規ブロックが変えてしまう副作用に気づき、ブロック末尾で明示的にリセットするよう修正した。

### I-3. 支部一覧リンクが `http` のまま

**指摘**: L16075（出場前チェックリスト内）の `http://goita.jp/ngps/` が、https で正常配信されていることを確認済みにもかかわらず平文リンクのままだった。

**対応**: `https://goita.jp/ngps/` へ1文字修正した（隣の `taikaisankahoho` リンクは元々https で正しい）。

**再検証**: `test_d2.js` の既存アサーション（リンクURLの完全一致チェック）が `http://` を期待していたため、`https://` を期待するようアサーション文字列を更新した。修正はリンクURLのみで、リンクの個数・ドメイン・色（`--aoi` 既定）・支部名非列挙などの他のD-2要件には影響していない。

## 対応しなかった指摘事項

Nice-to-have 6件（宇出津モーダルの支部都道府県列挙の丸め・`modal()`のaria-label引数追加・SRSのband保存・`goita_tourwin_v1`の計画ストレージ一覧への追記・採番の1行注記・計画外判断6件の妥当性評価）はレビューの総合判定上「今回は必須ではない」と明記されており、Must-fixのみに対応するというフェーズ4の運用（指摘されていない箇所への便乗修正はしない）に従い、本コミットでは対応していません。特に「`goita_tourwin_v1`の計画ストレージ一覧への追記」は計画書（`PLAN_v90_teacher.md`）本体の編集を伴うため、Executor単独では対応せずSonarのご判断を仰ぎたい項目です。

## 検証結果

- **単体動作確認（jsdom, 34ファイル・全PASS）**: 既存33ファイル全件を再実行し全PASS（回帰なし）。うち `test_t0.js`・`test_g2_propose.js`・`test_d2.js` の3ファイルは本修正に伴い更新・追加（詳細は上記）。レビューのQ3「G-2の試行検証はI-1の修正後に再テストが必要」を受け、`test_g2_trial.js` も明示的に再実行し全PASS（sc スタンプの信頼性を前提とする4アサーション全て通過、回帰なし）。
- **byte-exact確認**: `G`/`G_B` エンジンIIFEを `goita-app-v90b.zip` 抽出基準とのSHA相当の文字列完全一致で確認（両者完全一致）。`saveCareerToStorage()`/`loadCareerFromStorage()` も文字列完全一致。I-1〜I-3のいずれもエンジン・成績保存関数に一切触れていません。
- **axe-core構造的検証**: 4テーマ（yoai/kinari/hc/CUD）＋3件の独立スキャン（定石SRS復習・過去の自分/sig-echo・出場前チェックリスト）を実施。`region`（18ノード）・`aria-dialog-name`（1ノード）はv90c〜eの基準と完全一致（独立スキャンは16ノードとなる箇所がありますが、これも既報告どおりカード種別による表示ノード差で新規カテゴリではありません）。**新規違反カテゴリの追加はゼロ**でした。
- **禁止事項の機械確認**: 4テーマ＋3件の独立スキャンとも、指定11語彙のgrepが**0件**であることを確認。
- **構文確認**: 4つの `<script>` ブロック全てで `node --check` が合格。

## 受け入れ基準チェック表

| # | 基準 | 結果 |
|---|---|---|
| 1 | I-1: `resumeSavedMatch()`/`resumeFromMove()` の両方に `_scAtStart` 設定を追加 | ✓ |
| 2 | I-1: 再開経路のスタンプケースをtest_t0に追加 | ✓（2ケース追加） |
| 3 | I-2: `concept:null` 判定が hinted 込みの全エントリで算出される | ✓ |
| 4 | I-2: 全局hintedユーザーへのorder1提案をtest_g2_proposeで確認 | ✓ |
| 5 | I-3: 支部一覧リンクがhttps | ✓ |
| 6 | Q3: I-1修正後のtest_g2_trial再実行 | ✓（全4アサーションPASS） |
| 7 | 回帰確認（既存33ファイル） | ✓（全PASS） |
| 8 | byte-exact（G/G_B/saveCareerToStorage/loadCareerFromStorage） | ✓ |
| 9 | axe-core新規違反カテゴリゼロ | ✓ |
| 10 | 禁止語彙ゼロ | ✓ |
| 11 | `CACHE_NAME` → `goita-v102` | ✓ |

以上、REVIEW_REPORT_v90abcde.md の Must-fix 3件全てに対応し、検証が完了しました。ご確認をお願いします。
