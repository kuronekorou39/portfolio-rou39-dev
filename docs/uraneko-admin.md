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
在庫(トークン)投入と削除・ghost-code works からの一括登録・注文/発行一覧(商品/状態/
テキストで絞り込み)・署名付き DL リンク再生成・クーポン発行/削除・会計/精算(下記)。

## 会計・精算(会計タブ)

- **注文の絞り込み**(注文タブ): 商品・状態・注文ID/メアド部分一致・「会計除外を隠す」で絞れる。
- **精算(通貨別・コイン建て)**: BTC・LTC を**まとめず、それぞれコインのまま折半**する。
  通貨ごとに 受領 − コイン経費(送金手数料など)= 純受領、相手の取り分=純受領÷2、
  次回送る=取り分−送金済み(0 で下限クランプ、超過は「過払い」表示)。円換算は不要。
- **受領コインの取り方**: 各注文の `outcome_amount`(NOWPayments 手数料控除後=ウォレット着金額)を使う。
  未記録の注文は `actually_paid`→`pay_amount` で概算(明細に「概算」表示)。明細の**「修正」**から
  ウォレットの実着金額を手入力すると、その注文は正確値(「修正済」)になる。上書きは注文データではなく
  ローカル台帳(`received_overrides`)に保存する。精算の「受領」と明細の「受領コイン」は必ず一致する。
- **テスト注文の除外**: 明細の「除外」でテスト購入を精算・CSV から外せる(注文タブにも除外印)。
- **経費**(通貨別・手入力): BTC/LTC のコイン経費(送金手数料など)はその通貨の折半前に差し引く。
  **円の経費(サーバ代等)**も、各通貨の売上比で按分し**注文の実効レートでコインに換算して差し引く**
  (各通貨の差引コイン = 円経費総額 × その通貨の受領コイン ÷ 総売上円。換算は概算)。
  コイン売上がまだ無い間は換算できず、売上が出たら反映される。
- **共同出資者への支払い履歴**(BTC/LTC のコイン建て)を追加/削除できる。送金は月1・15日ごろ想定で、
  「次回送る」に次回の目安額が出る。
- 円建ての **税務サマリ**(年次/月次・確定売上=paid の price_jpy)と CSV 出力は従来どおり。

これらの運用データ(除外・経費・支払い)は AWS ではなく**この PC のローカル JSON 台帳**に保存する:
`scripts/uraneko/uraneko-ledger.json`(`.gitignore` 済み、`URANEKO_LEDGER_PATH` で変更可)。
**共同出資者との精算元帳になるので、別ドライブ等へ定期バックアップを推奨**(git には入れない)。

## 管理 CLI(スクリプト向け)

```bash
node scripts/uraneko/uraneko-admin.mjs            # 引数なしでヘルプ
node scripts/uraneko/uraneko-admin.mjs products list --all
node scripts/uraneko/uraneko-admin.mjs ingest --id <product_id> --file <local.mp4> --bits <40bit>
```

## アクセス集計(軽量)

サイトのアクセス数を「軽く」把握する用に、CloudFront の標準アクセスログを S3 に出している
(`infra/lib/uraneko/frontend-stack.ts` で有効化)。集計は **管理 GUI の「アクセス」タブ**か、
同じロジックのローカルスクリプトのどちらでも見られる。

集計の実体は rou39.com と共通の `scripts/lib/cf-access-stats.mjs`(`scripts/uraneko/access-stats.mjs`
はそこにサイト設定を束ねるだけの薄い入口)。**サイトを横断して見たいときは
[アクセス解析](access-stats.md) の GUI(`scripts/access/access-server.mjs`)を使う。**
数え方の注意(探索アクセスの分離・「入口ページ」の意味)もそちらに書いてある。

- **GUI**: 管理画面の「アクセス」タブ。日数(7/14/30)を選んで「更新」で取得。開くたびに読むと
  重いので初回表示時のみ自動読み込み。GUI サーバは S3 を読むだけ(書き込みなし)。
- **CLI**:

```bash
node scripts/uraneko/access-stats.mjs            # 直近7日
node scripts/uraneko/access-stats.mjs --days=30  # 直近30日
```

→ 総リクエスト・ページ表示・ざっくり訪問者(ユニークIP)・ボット割合・日別/時間別・入口ページ・
流入元(リファラ)・アクセス元 IP / UA を表示する。バケットは `uraneko-access-logs-<account>`
(自動検出、`URANEKO_LOG_BUCKET` で明示も可)。

実在しないパスへの探索アクセスは集計から分離している(SPA は 404 にもトップページを 200 で
返すため、分けないとスキャンがページ表示として数えられる)。ルートを増やしたら
`scripts/lib/cf-access-stats.mjs` の `SITES.uraneko.routes` も更新すること。

- **費用**: CloudFront のログ機能は無料。S3 保管は小規模なら月数円。ログは **90 日で自動削除**。
- **注意**: ログには IP / User-Agent が含まれる(個人情報)。SPA のためページ表示はすべて
  `/index.html` に集約され、ページ別内訳は取れない。配信に数分〜数時間の遅延あり。
- 有効化には CloudFront(UranekoFrontend スタック)の CDK デプロイが必要。

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
