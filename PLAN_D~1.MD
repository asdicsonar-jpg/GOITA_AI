# PLAN_deploy_v84: ごいたアプリのWebデプロイ(GitHub Pages + フルPWA)

作成: 2026-07-12 / Planner: Fable5 (goita-dev-loop フェーズ1)
対象: goita_1.html (v83, 935,484 bytes, 単一ファイルHTML)

## 変更の目的

goita_1.html をスマホのWebブラウザからURLで起動できるようGitHub Pagesへデプロイし、ホーム画面追加による全画面起動とオフライン対局(フルPWA)を実現する。公開範囲は「URLを知る人だけ」とし、検索エンジンには載せない。

## 前提の確認結果(2026-07-12時点・Web検索で確認済み)

- GitHub Freeプランでは **Pagesはpublicリポジトリのみ**。privateリポジトリのPagesはGitHub Pro以上が必要
- Pages制限: サイト1GB以下・帯域100GB/月(soft)・ビルド10回/時(soft) → 本アプリ(約1MB)には全く問題なし
- iOS 26では「ホーム画面に追加」したサイトは既定でWebアプリとして全画面起動する。Service Workerは動作するが、ストレージ逼迫時やSafari履歴消去でキャッシュ・localStorageが削除されうる

### ⚠️ Sonarに事前確認すべき決定事項

GitHub Free + Pagesの制約上、**リポジトリ(ソースコード)も公開**になる。対応案:

- **案A(採用予定)**: publicリポジトリ + 推測されにくいリポジトリ名 + noindex。ソースは公開されるが、実質的に到達者は限定される。無料。
- 案B: GitHub Pro(有料)にしてprivateリポジトリからPages配信。
- 案C: Cloudflare Pagesに変更(privateリポジトリ連携が無料、ランダムサブドメイン)。

ソース公開が許容できない場合は案B/Cへ切り替えるため、実装着手前にSonarの判断を仰ぐこと。以下は案A前提。

## 対象ファイル・関数

リポジトリ構成(新規作成):

```
goita-app/  (リポジトリ名は推測されにくいものにする)
├── index.html        ← goita_1.html を改名(変更は下記4行の追加のみ)
├── manifest.json     ← 新規
├── sw.js             ← 新規
├── icons/
│   ├── icon-192.png          ← 新規(通常アイコン)
│   ├── icon-512.png          ← 新規(通常アイコン)
│   ├── icon-maskable-512.png ← 新規(セーフゾーン内に収めたAndroid用)
│   └── apple-touch-icon.png  ← 新規(180×180, iOS用)
├── robots.txt        ← 新規(Disallow: /)
├── .nojekyll         ← 新規(Jekyll処理をスキップ)
└── docs/PLAN_deploy_v84.md
```

- **index.html**: `<head>`内への追加のみ4行。既存行の変更・削除は一切禁止
  1. `<meta name="robots" content="noindex, nofollow">` (限定公開)
  2. `<meta name="theme-color" content="#0d131d">` (ステータスバー色 = --ink0)
  3. `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`
  4. `<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">`
  - 既にL219に`<link rel="manifest" href="manifest.json">`、L222-224にsw.js登録コードが存在するため、**manifest/sw関連のHTML変更は不要**(v83時点で下準備済み)

## 実装方針

### 1. manifest.json

```json
{
  "name": "ごいた — 能登の伝承遊戯",
  "short_name": "ごいた",
  "lang": "ja",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#0d131d",
  "background_color": "#0d131d",
  "icons": [
    {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
    {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
    {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
  ]
}
```

### 2. sw.js(キャッシュ戦略が本計画の核心)

- `CACHE_NAME = "goita-v84"` — **HTML更新のたびに必ずインクリメント**する運用
- プリキャッシュ(install時): `index.html`, `manifest.json`, アイコン4点
- **index.html は network-first + cache fallback**。cache-firstにすると更新が届かない事故が起きるため不採用。オンライン時は常に最新を取得し、オフライン時のみキャッシュで起動
- Google Fonts(css2 + woff2)は **stale-while-revalidate** でランタイムキャッシュ(cross-origin、`fonts.googleapis.com` / `fonts.gstatic.com` のみ対象)。初回オフラインは代替フォント表示になるが、一度オンラインで起動すれば以後オフラインでも筆文字が出る
- activate時に旧`goita-*`キャッシュを削除
- `skipWaiting()`は**使わない**(対局中に新SWへ切り替わる事故を防ぐ。新版は次回起動時に反映)
- 上記以外のcross-originリクエスト(twitter.com等の外部リンク)はSWで触らない

### 3. アイコン生成

駒(王)をモチーフに、背景 #0d131d・駒色 #f7eed8 のシンプルなデザインをSVGで作成し、sharpまたはImageMagickで 192/512/maskable-512/180 の4サイズにラスタライズ。maskable版は中心80%のセーフゾーン内に収める。

### 4. デプロイ手順

1. GitHubにpublicリポジトリ作成(推測されにくい名前、例: ランダム接尾辞付き)
2. 上記ファイル一式をpush(mainブランチ)
3. Settings → Pages → Source: `main` / `(root)` を選択
4. `https://<user>.github.io/<repo>/` で配信開始(HTTPS自動・強制)

### 5. 今後の更新フロー(v85以降)

新しいgoita.htmlができたら: (1) head追加4行を移植して index.html を差し替え → (2) sw.js の CACHE_NAME をインクリメント → (3) push。この3点セットを更新の定型手順とする。

## 想定される副作用・リスク

- **localStorageのオリジン分離**: 設定(goita_cfg_v1)・成績(goita_career_v1)は `https://<user>.github.io` オリジンに保存される。従来 file:// や別ホストで遊んだデータは引き継がれない。将来ホスティングを移転すると成績が消える → ホスト選定は今回で確定させるのが望ましい
- **iOSのデータ揮発性**: Safariの履歴消去・ストレージ逼迫でSWキャッシュとlocalStorageが消えうる(iOS仕様)。成績の完全永続は保証不可 → 既存の棋譜共有テキスト機能が実質的なバックアップ手段であることをREADMEに明記
- **SWキャッシュ起因の更新不達**: network-first + CACHE_NAME運用で軽減するが、検証計画で更新テストを必須とする
- **ソースコード公開**(案Aの帰結): 上記「決定事項」参照
- **noindexの限界**: robots.txtのDisallowはインデックス除外を保証しないため、meta noindexを本命とする(両方設定)
- 既存のsw.js登録コードは `location.protocol.startsWith("http")` ガード付きのため、ローカルfile://での動作確認フローには影響しない

## 検証計画

- **回帰確認(byte-exact)**: `diff <(元goita_1.html) <(index.html)` で差分が計画された追加4行のみであることを機械確認
- **ローカル検証**: `python3 -m http.server` + Playwright headless(iPhone SE/14相当のモバイルビューポート)で (1) 起動・対局開始 (2) console errorゼロ (3) manifest/sw.jsの200応答 を確認
- **PWA要件検証**: Lighthouse(またはChrome DevTools Application panel)でinstallable判定・manifest解釈・SW登録を確認
- **オフライン検証**: Playwright/DevToolsで `offline: true` にして再読み込み→起動・対局可能を確認。フォントキャッシュ済みなら筆文字表示も確認
- **更新伝播検証**: CACHE_NAMEを仮に上げた版を配置→再訪1回で新版取得を確認(network-first動作)
- **実機検証(Sonar実施)**: デプロイ後、実スマホで (1) URL起動 (2) ホーム画面追加→全画面起動 (3) 機内モードで再起動→対局 (4) 設定変更→再起動で永続確認

## 受け入れ基準

1. スマホブラウザで公開URLを開き、対局を開始・完了できる
2. ホーム画面追加でstandalone(全画面・ブラウザUI無し)起動する
3. 一度オンラインで起動した後、機内モードでも起動・対局できる
4. index.htmlの差分が計画された追加4行のみ(byte-exact確認済み)
5. meta noindex + robots.txt が配信されている
6. Lighthouse相当のチェックでinstallable判定が通る

基準1〜6をすべて満たさない限りデプロイ完了としない。

## Executor(Sonnet5)への申し送り

- index.htmlへの変更は追加4行のみ。それ以外の差分が1バイトでも出たら手を止めてSonarに報告
- sw.jsのfetchハンドラは対象を限定し、想定外のリクエストは素通し(`return`)させる防御的実装とする
- アイコンのデザイン調整は本計画のスコープ外(仮デザインで可、差し替え容易な構成にする)
