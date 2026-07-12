# uraneko 管理オペレーション

uraneko(動画販売サブドメイン)には**公開 Web 管理画面は作らない**方針(攻撃面になるため)。
商品・在庫・価格・トークン・クーポンの運用は、ローカル専用の GUI か CLI から行う。
実処理は `scripts/uraneko/lib/uraneko-store.mjs` に集約(GUI/CLI 共通)。

前提: AWS CLI / 環境変数で ap-northeast-1 に認証済みであること。

## ローカル管理 GUI(推奨)

```bash
node scripts/uraneko/uraneko-admin-server.mjs
```

→ ブラウザで **http://127.0.0.1:4173** を開く。
127.0.0.1 のみにバインドするローカル専用ツール(ネットワークには公開しない)。
Host 検証 + Origin 検証で CSRF/DNS リバインディングを防いでいる。

ポート変更: `URANEKO_ADMIN_PORT=5000 node scripts/uraneko/uraneko-admin-server.mjs`

GUI でできること: 商品の作成/編集・価格/公開トグル・サムネ/サンプル画像・
在庫(トークン)投入と削除・ghost-code works からの一括登録・注文/発行一覧・
署名付き DL リンク再生成・クーポン発行/削除。

## 管理 CLI(スクリプト向け)

```bash
node scripts/uraneko/uraneko-admin.mjs            # 引数なしでヘルプ
node scripts/uraneko/uraneko-admin.mjs products list --all
node scripts/uraneko/uraneko-admin.mjs ingest --id <product_id> --file <local.mp4> --bits <40bit>
```

## 商品追加の基本手順

1. GUI で商品を作成(published: false のまま)。価格・タイトル・説明・サムネを設定。
2. 動画(ghost-code で生成した mp4)を「在庫データ / INGEST」から投入。
   1トークン = 1 本の mp4 = 在庫 +1。**bits(透かしコード)欄に実コードを入れる**
   (流出追跡のため。空だと乱数が入り追跡不能になる)。
3. サムネ/サンプル画像を設定。
4. 在庫が入ったら published: true で公開。

## E2E / テスト

擬似 webhook 送信(先行受け渡しフローのテスト):

```bash
node scripts/uraneko/fake-nowpayments-webhook.mjs <order_id> <endpoint> [payment_status]
# payment_status 例: confirming → finished の順で先行受け渡しを再現
```

endpoint は誤爆防止のため必須。本番に撃つ場合のみ意図的に
`https://uraneko.rou39.com/api/webhooks/nowpayments` を指定する。
