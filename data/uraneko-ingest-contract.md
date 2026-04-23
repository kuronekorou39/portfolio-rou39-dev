# uraneko 動画投入契約(ghost-code 向け)

このドキュメントは `ghost-code` プロジェクトから `uraneko.rou39.com` への動画(stego .mp4)投入仕様を定める。契約変更時はここを更新し、ghost-code 側に周知する。

## 前提

- ghost-code は自宅 GPU マシンで実行されるローカルスクリプト
- 書き込み先の AWS リソースは `UranekoIngestStack` で作成された IAM User `uraneko-ghost-code-ingest` の AccessKey を使用
- リージョン: `ap-northeast-1`

## 書き込み対象

### 1. S3 オブジェクト

```
Bucket: uraneko-assets-{account_id}
Key:    videos/{product_id}/{token_id}.mp4
```

| 項目 | 仕様 |
|---|---|
| `product_id` | kebab-case 文字列(例: `sample-movie-1`)、`[a-z0-9-]+` のみ |
| `token_id` | UUID v4(ghost-code 側で採番) |
| Content-Type | `video/mp4`(PutObject 時に必ず指定) |
| ACL | デフォルト(非公開)。バケット側で BlockPublicAccess を有効化しているので特に指定不要 |

### 2. DynamoDB `uraneko-video-tokens` への PutItem

```json
{
  "token_id":    "<UUID v4>",
  "product_id":  "<product_id と同じ値>",
  "s3_key":      "videos/{product_id}/{token_id}.mp4",
  "bits":        "<40文字の '01' 文字列>",
  "status":      "unassigned",
  "assigned_to": null,
  "assigned_at": null,
  "order_id":    null,
  "created_at":  "<ISO8601 UTC, 例: 2026-04-23T10:00:00.000Z>"
}
```

- `bits` は透かしビット列(40bit、`"0"`/`"1"` の 40文字文字列)
- `status` は必ず `"unassigned"` で登録
- `null` 値は DynamoDB の `NULL` 型で OK

## 書き込み順序(重要)

**必ず以下の順序を守ること**:

1. S3 `PutObject`(動画アップロード)
2. DynamoDB `PutItem`(トークンレコード登録)

理由: DDB にレコードがあるのに S3 に物がない状態は「購入 → 署名URL 発行 → 404」という致命的な不具合になる。逆の失敗(S3 にあるが DDB に無い)は orphan object が残るだけで購入には影響しない。orphan は別途 cleanup スクリプトで回収する。

## ghost-code が **触らない** もの

以下のテーブル/リソースには書き込まない。IAM ポリシーでも拒否:

- `uraneko-video-products`(商品マスタ、管理者が別途投入)
- `uraneko-orders`(購入記録、API Lambda のみが書く)
- S3 の `videos/` 以外のパス(`thumbnails/` 等、必要になれば別途契約追加)

## IAM ポリシー(Ingest User 側)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::uraneko-assets-{account}/videos/*"
    },
    {
      "Effect": "Allow",
      "Action": "dynamodb:PutItem",
      "Resource": "arn:aws:dynamodb:ap-northeast-1:{account}:table/uraneko-video-tokens"
    }
  ]
}
```

## エラーハンドリング(ghost-code 側への推奨)

- S3 PutObject 失敗 → リトライ(指数バックオフ、最大 3 回)。失敗したら処理中止。DDB 書込は絶対にしない
- DDB PutItem 失敗 → リトライ(最大 3 回)。失敗したら: S3 object は残るので `data/orphan-s3-keys.log` 等に記録して後日 cleanup
- 同じ `token_id` を再投入する必要は通常無い(UUID なので衝突しない)
