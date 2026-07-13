# ごいた — Web版デプロイ手順(GitHub Pages / v84)

本フォルダ(`goita-app/`)一式をそのままリポジトリのルートとして公開する。
参照計画書: `docs/PLAN_deploy_v84.md`

## 初回デプロイ手順

1. GitHubで **publicリポジトリ**を新規作成する(GitHub Freeプランでは Pages は public リポジトリのみ対応)。
   - リポジトリ名は推測されにくいもの(ランダム接尾辞付きなど)を推奨。本アプリは `meta robots noindex` と `robots.txt` で検索除外設定済みだが、リポジトリ自体は公開される点に注意。
2. 本フォルダの中身(`index.html` / `manifest.json` / `sw.js` / `icons/` / `robots.txt` / `.nojekyll` など)をリポジトリのルートへ push する(`main` ブランチ)。
   ```
   git init
   git add -A
   git commit -m "goita-app v84 initial deploy"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
3. GitHubリポジトリの **Settings → Pages** を開き、Source を `Deploy from a branch`、Branch を `main` / `(root)` に設定して保存する。
4. 数分後、`https://<user>.github.io/<repo>/` で配信が開始される(HTTPS自動・強制)。

## 更新フロー(v85以降)

新しい `goita.html` ができるたびに、以下の3点セットを必ず実施する。

1. 新しいHTMLの `<head>` に、v84で追加した4行を移植して `index.html` を差し替える。
   - `<meta name="robots" content="noindex, nofollow">`
   - `<meta name="theme-color" content="#0d131d">`
   - `<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">`
   - `<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">`
2. `sw.js` の `CACHE_NAME` を必ずインクリメントする(例: `goita-v84` → `goita-v85`)。これを忘れると古いキャッシュが残り続け、ユーザーに更新が届かない。
3. push する。

UI/UXの変更を行う場合は、着手前に `docs/DESIGN_CHARTER.md`（デザイン憲章）を確認する。

index.html は network-first + cache fallback で配信されるため、オンライン時は常に最新版が取得される。CACHE_NAMEのインクリメントは、旧キャッシュの破棄とオフライン起動時に参照される版を確実に更新するために必要。

## iOSにおけるデータ揮発性の注意

- 設定(`goita_cfg_v1`)・成績(`goita_career_v1`)は `localStorage` にブラウザオリジン単位で保存される。ホスティング先(ドメイン)を変更すると、それまでの成績・設定は引き継がれない。
- iOS Safari の仕様上、**履歴とWebサイトデータの消去操作**や、端末のストレージ逼迫時の自動クリーンアップにより、Service Workerのキャッシュや localStorage が予告なく削除されることがある。これはアプリ側の不具合ではなくOS/ブラウザの挙動であり、完全な永続性は保証できない。
- 上記の対策として、アプリ内の **棋譜共有テキスト機能**(局面・対局の共有用テキスト出力)を実質的なバックアップ手段として活用できる。大事な対局・記録は共有テキストとして書き出し、メモアプリやメッセージ等外部に保存しておくことを推奨する。

## 参考: リポジトリ構成

```
goita-app/
├── index.html
├── manifest.json
├── sw.js
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
├── robots.txt
├── .nojekyll
├── README.md
└── docs/
    ├── PLAN_deploy_v84.md
    └── DESIGN_CHARTER.md
```
