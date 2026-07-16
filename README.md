# jsdomテスト資産(v90.2)

これらはgoita-dev-loopの検証で使用したjsdomベースの単体テストです。実行方法:

1. `npm init -y && npm install jsdom axe-core --save-dev`
2. `index.html`の末尾IIFE内(`})();`の直前)に`shim_block.txt`の内容を挿入したテスト用コピーを同ディレクトリに`index.html`として置く
3. `node test_f1.js` / `node test_f2.js` / `node test_f3.js` / `node test_review_fixes.js` を実行

過去のセッションでテスト資産がサンドボックス再構築により失われた反省(REVIEW_REPORT_v90.2.md「検証への疑問点」2)を踏まえ、zipにテスト資産を同梱して永続化しています。
