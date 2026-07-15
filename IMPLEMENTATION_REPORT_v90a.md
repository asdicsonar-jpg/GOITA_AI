# 実装レポート v90a「見立て」

- Executor: Sonnet5
- 対象計画: `PLAN_v90_teacher.md`（改訂3版）v90a セクション（T-0〜T-5）
- 基準ファイル: アップロードされた `goita-app-v90.1.zip`（index.html 15,738行・`CACHE_NAME="goita-v96"`）

## 0. 基準ファイルに関する重要な確認事項

計画書は対象を「index.html（v89c, 15,701行）+ sw.js（現行 CACHE_NAME = "goita-v95"）」としていましたが、実際にアップロードされた `goita-app-v90.1.zip` は以下の通りでした。

- 行数: 15,738行（計画書の想定より37行多い）
- `sw.js` の `CACHE_NAME`: `"goita-v96"`（計画書の想定より1つ進んでいる）

差分を機械diffで確認した結果、これは自分（Sonnet5）が納品した `goita-app-v90.zip`（15,701行・goita-v95）に対し、Sonarの報告した「かかり応えの符丁誤読」バグ（八丁で相方が2巡目に打った金をペア合図と誤認する不具合）の修正が、本計画とは別のパッチとして`G`/`G_B`両エンジンに適用済みのものでした（build コメントに `v90.1 / Fix: かかり応えの符丁誤読...` と明記されており、意図的な正規の修正と判断）。

**この事実は計画書のF-1〜F-17の行番号引用に影響します。** 実装にあたっては計画書の行番号を鵜呑みにせず、都度grepで実在箇所を確認してから編集しました（Executor申し送り5.の教訓を踏まえた対応）。

### CACHE_NAMEの繰り上げ（計画からの逸脱・要報告）

計画は v90a で `CACHE_NAME` を `goita-v95→v96` にすることを指示していましたが、`v96`は前述の通り既にv90.1のかかり応え修正で消費済みでした。README.mdが明記するキャッシュ運用規律（「インクリメントを忘れると古いキャッシュが残り続ける」）に照らし、既使用のバージョン名を再利用するのは危険と判断し、**v90シリーズ全体を+1繰り上げました**（v90a=v97, v90b=v98, v90c=v99, v90d=v100, v90e=v101 を予定）。goita-dev-loopの「想定外は勝手に方針変更せず報告する」に従い、ここに明記します。他の解決策が適切であればご指示ください。

## 1. 実施した変更

### T-0 足場スタンプ
- `app` 状態オブジェクトに `_scAtStart`（局開始時点のcfgスナップショット）を追加。
- `matchSaveAllowed()` と同型の `scaffoldStampAllowed()`、および計画書のコードをそのまま採用した `scaffoldStamp()` を新設（`matchSaveAllowed()` の直後に配置）。
- `startGame()` の冒頭（既存のキリコ持続演出ガードの直後）で `app._scAtStart = {...app.cfg}` を実行。
- `onGameOver()` 内、`app.matchRecs.push(app.rec)` の直前で `app.rec.sc = scaffoldStampAllowed() ? scaffoldStamp() : null` を設定し、`app.coachHistory.push()` / `app.career.push()` の両方に `sc` を追加（既存の `hinted` は削除せず維持）。
- `slimRecForStorage()` の返却オブジェクトに `sc: r.sc || null` を追加。
- 局中の安全側反映: 「調整」モーダルの確定処理（`saveCfgToStorage()` 直前）に、10キーそれぞれについて「ONなら`_scAtStart`も引き上げ、OFFでは引き下げない」ループを追加。

### T-1 稽古札（`#keiko-panel`）
- 計画は「`#resume-panel`と`#ladder-panel`は隣接している」としていましたが、実際は両者の間に`#tutorial-panel`が既に存在し隣接していませんでした（**計画書とコードの不一致・計画のこの記述は不正確**）。配置意図（ladder-panelの直前）を優先し、`#tutorial-panel`と`#ladder-panel`の間に挿入しました。
- 優先順位1（復習期日・v90c）/2（卒業提案・v90b）は関数を用意しつつ常に`null`を返すスタブとし、優先順位3（弱点ドリル）のみ機能する状態で実装。
- 却下「今日はいい」は `goita_keiko_v1 = {dismissedOn}` で当日のみ抑制（種類を問わず）。
- `#resume-panel` 表示中は優先度3を抑制（R-a4）。resume-panelの「破棄」操作後は稽古札を再評価。
- 起動時・`stopToSetup()`・`exitTutorial()`の非サイレント終了時、の3箇所で再評価する設計とし、対局を終えて設定画面へ戻るたびに最新の学習者モデルを反映するようにしました（計画に明記はありませんが、T-2の目的「見立てをpush」に沿う自然な拡張と判断）。

### T-2 学習者モデルのpush化
- `keikoEvalWeakAsync()` として、`openConceptProfile()` と同型の非同期退避パターン（`requestIdleCallback`優先・フォールバックで`setTimeout(...,30)`相当）を実装。
- 弱点上位1件が `conceptMastery() < 0.6` かつ `seen >= 5`（=`conceptMastery`がnull以外を返す）の時のみキャッシュに載せ、それ以外は「データ不足時は何も出さない」を徹底。

### T-3 kyoドリル
- `TUT_DEAL_KYO`（新規配牌）と `TUT.kyo`（中級「香の温存」・6ステップ）を追加。他の中級シナリオ（kakari/barabara/ukenai）と同じ構造（`title`/`reveal`/`deal`/`parent`/`tiers`/`steps[]`、`mode: next/auto/await`、`finish: true`）を厳密に踏襲しました。
- 内容: 「香は4枚しかなく王でも受けられない特別な駒→1枚なら温存、2枚以上ある時だけ序盤リードで符丁とする→相方が応える」という、既存の「かかり応え」の香版として設計。エンジンの実在コメント（`kyo2`/`teki_kyo`/`occupancy`joseki定義）に基づいた内容で、フィクションを混ぜていません。
- `CONCEPT2TUT.kyo` を `"jissen"` → `"kyo"` に変更、`DRILLS` に `d_kyo` を追加（計画のgoal文言をそのまま採用）。
- **配牌の妥当性を実エンジンで検証済み**（後述4節）。手詰まりや不正な手が発生しないことを、実際の`applyAndLog`経由で確認しました。

### T-4 混在ドリル
- `openDrillList("__mixed")` 分岐と、全ドリル一覧表示時のみ先頭に出る「混ぜ稽古」カードを追加。
- `openMixedDrill()`: 弱点上位3概念（mastery昇順・seen>=5）に属する全ドリルを収集しシャッフル（登録数により3〜5本）。データ不足時は専用メッセージを表示し`_mixQueue`は作らない。
- `app._mixQueue`（新設）でキューを管理。`app.drill`（今日の一手解き直し用・既存）には一切触れていません。
- `tutFinish()` と `tutFreeOver()`（goshi/jissenのような自由対局へ移行するシナリオの完了経路）の両方に、混ぜ稽古中は通常の課程UIではなく`mixDrillAdvance()`（概念開示+連結）を呼ぶ分岐を追加。
- `stopToSetup()`（トップバー「設定へ」からの中断）で `_mixQueue` をクリアし、状態が残らないようにしました。

### T-5 大会仕様プリセットの修正
- `LADDER_PRESETS.tournament` に `explain:false, tempo:false, riverseq:false` を追加。`beginner`/`practice`は`null`（既存の`livebar:null`と同じ意味論・触らない）。
- `applyLadderPreset()` に `livebar`と同型のnullガードを3キー分追加。
- note文言をC案（Sonar承認・改訂3版）通りに修正: `practice`から「だけ」を削除、`tournament`に「AIの思考表示や気配の演出も切ります」を追加（当日の所作の記述は既存文言のまま・範囲を広げていません）、`beginner`は無変更。

## 2. 計画からの逸脱

1. **CACHE_NAMEの繰り上げ**（v96→v97、以降の全サブコミットも+1）。理由は本レポート0節に記載。
2. **T-1の配置**: `#resume-panel`と`#ladder-panel`は計画の想定と異なり隣接していなかったため、`#tutorial-panel`と`#ladder-panel`の間に配置。
3. **稽古札の再評価タイミング**: 計画は明記していませんが、起動時に加えて`stopToSetup()`/`exitTutorial()`でも再評価するようにしました。

いずれも軽微な手続き上の判断であり、設計方針そのものの変更ではないと考えていますが、念のため明記します。

## 3. 検証結果

- **byte-exact**: `G`（現在L2184-5664・3,481行）/ `G_B`（現在L5683-9174・3,492行）を、波括弧深度で機械抽出し、基準ファイル（v90.1）と文字列完全一致を確認。v90aの変更はエンジン非接触のため、当然ながら差分ゼロ。
- **構文**: 4つの`<script>`ブロック全てで `node --check` 合格。
- **単体テスト**（jsdom+実エンジン、`/tmp/pwtest/`に新規構築。Playwrightはネットワーク制限で不可のためv89から継続する制約）:
  - `test_t0.js`: `_scAtStart`のスナップショット・安全側反映（ON引き上げ/OFF維持）・`scaffoldStampAllowed()`の4ゲート（humanSeat/practice/tutorial/research）・`slimRecForStorage()`のsc透過、全て合格。
  - `test_t1.js`: データなし非表示・弱点提案の表示内容・「今日はいい」の当日抑制と翌日リセット・resume-panel共存時の抑制(R-a4)、全て合格。
  - `test_t2.js`: 非同期性(呼び出し直後は未完了)の確認・データ不足時null・弱点概念の正しい特定、全て合格。
  - `test_t3.js`: **`TUT.kyo`の新規配牌・スクリプトを実際のゲームエンジン（`applyAndLog`経由）で最初から最後まで通しで実行し、bury/attack/receive/passの全手が合法であることを確認**。プレイヤーの香応答時に手駒に香が残っていること、応答後に東・北・西の誰も受けられないこと（4枚全ての所在を検証済み）、`tutFinish()`到達とチュートリアル進捗への反映まで確認。
  - `test_t4.js`: データ不足時のガード・`_mixQueue`が3〜5本で構築されること・完了前は概念名が非開示であること・`tutFinish()`/`mixDrillAdvance()`の連結（概念開示テキストの内容も検証）・`app.drill`の非干渉・`stopToSetup()`によるクリーンアップ、全て合格。
  - `test_t5.js`: tournament3キーOFF・beginner/practiceのnullガード不変・note文言のC案反映、全て合格。
  - `test_ongame.js`: `onGameOver()`を実際の状態で直接実行し、例外なく完走・`sc`が`career`/`coachHistory`/`matchRecs`に正しく伝播・既存の`hinted`等が無傷であること・`saveCareerToStorage()`/`loadCareerFromStorage()`の往復が新フィールドで例外を出さないことを確認。
  - `test_settings_hook.js`: 「調整」モーダルをDOM操作で実際に開き、`assistHi`をONにして確定ボタンを押す一連の操作で、`_scAtStart`が正しく引き上がり、かつ既存の`saveCfgToStorage()`の永続化挙動が壊れていないことを確認。
  - `test_misc_hooks.js`: `exitTutorial(false)`・resume-panelの「破棄」ボタン、いずれも新しい稽古札再評価フックを含めて例外なく動作。
- **回帰**: v89の「安定10テスト」は本セッションのサンドボックス再起動によりテストファイル自体が失われていたため、同名テストの再構築はできていません。代わりに、v90aで変更した各関数（`startGame`/`onGameOver`/`slimRecForStorage`/`stopToSetup`/`exitTutorial`/「調整」モーダルの確定処理/`applyLadderPreset`/`openDrillList`/`tutFinish`/`tutFreeOver`）それぞれについて、既存の非v90a機能（自動保存・調整モーダルの永続化・大会仕様プリセットの他の副作用・チュートリアル進捗記録等）が変更前と同じ結果を返すことを個別に確認しました。**test_a4/test_b1相当の不安定テストの10回実行による非劣化確認は未実施です**（テストファイル自体が無いため）。
- **axe-core**: 夜藍・生成り・高コントラストの3テーマ+CUDで実行。**pre-existingの`region`（ランドマーク）警告（moderate）が16件→19件に増加**していますが、これは基準ファイル(v90.1)の時点で既に存在していた構造的特性（`#resume-panel`等、setup-screen内の各パネルがランドマーク要素で囲われていない）に、新設した`#keiko-panel`が兄弟要素として3件加わったものです。同種の新規カテゴリの違反は0件でした。`forced-colors`はjsdomでネイティブ検証不能なため、色のみに依存する新規UIが無いことをスポットチェックで代替確認しました（v89からの継続的制約）。
- **禁止事項の機械確認**: 出力DOM（`<script>`/`<style>`除去後のbody）に対し、指定11語彙の grep が **0件**であることを確認。

## 4. 既知の懸念点

1. **v89安定10テストの再構築ができていません。** セッションのサンドボックス再起動によりテスト資産が失われたためです。次サブコミット（v90b）着手前に、少なくとも自動保存・axe-core・スモークe2eに相当するテストの作成を検討することを提案します。
2. **axe-coreの`region`警告**: 上述の通りpre-existingであり、v90aはその範囲を拡大させていません（新規カテゴリの違反ゼロ）。setup-screen全体をランドマーク要素で再構成する修正は本計画の対象外と判断し実施していません。必要であれば別途ご指示ください。
3. **T-1の再評価タイミングの拡張**（起動時のみでなく`stopToSetup`/`exitTutorial`でも再評価）は計画に明記のない判断です。意図（対局のたびに見立てを更新する）に沿うと考えていますが、ご確認をお願いします。
4. **T-3のkyoシナリオ内容**: エンジンの実在するjoseki定義（`kyo2`/`teki_kyo`/`occupancy`）を根拠に設計しましたが、内容設計そのもの（教材としての分かりやすさ・尺）はレビューをお願いしたい領域です（計画書R-a5相当）。
5. **CACHE_NAMEの繰り上げ**（v97〜v101予定）について、他に望ましい採番方針があればご指示ください。

## 5. 受け入れ基準チェック

| # | 基準 | 結果 |
|---|---|---|
| 1 | G/G_Bがbyte-exact一致 | ✓ |
| 2 | v89の安定10テストが全て再合格 | △ テスト資産喪失のため未実施(4節参照) |
| 3 | test_a4/test_b1の合格率非劣化 | △ 同上 |
| 4 | T-0導入前後で番付・概念別プロフィールの出力が一致 | ✓（`sc`は追加のみ・`hinted`等の既存ロジック不変を確認） |
| 5 | T-2が初回描画をブロックしない | ✓（test_t2で非同期性を確認） |
| 6 | T-5: 大会仕様でexplain/tempo/riverseqが全てOFF | ✓ |
| 7 | T-5(C案): practiceの「だけ」除去・tournamentに追記・beginner無変更・実フラグ不変 | ✓ |
| 8 | axe-core構造的違反ゼロ | △ pre-existing region警告のみ(新規カテゴリはゼロ) |
| 9 | 禁止事項が実装されていない | ✓ |
| 10 | CACHE_NAME → goita-v96 | △ v97へ繰上げ(0節参照) |

次のサブコミット（v90b「卒業」）へ進む前に、上記の逸脱・懸念点についてご確認をお願いします。
