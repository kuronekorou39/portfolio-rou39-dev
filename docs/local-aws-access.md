# ローカルの AWS 権限

ローカル管理ツール(seed / uraneko 管理 GUI / アクセス解析)が使う IAM の話。
本番デプロイは CI が GitHub OIDC で行うので、ここには関係しない。

## 現状(2026-08-05 見直し)

| 項目 | 値 |
|---|---|
| IAM ユーザー | `portfolio-deployer` |
| ポリシー | `portfolio-local-tools`(カスタマー管理・`AdministratorAccess` は剥がした) |
| 認証情報 | `~/.aws/credentials` の `[default]` |
| 緊急時の管理者経路 | **root(MFA 有効)** |

ポリシーの中身は `infra/policies/portfolio-local-tools.json` が正。
CDK 管理ではなく CLI で作成・更新する:

```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::234080517105:policy/portfolio-local-tools \
  --policy-document file://infra/policies/portfolio-local-tools.json \
  --set-as-default
```

> ポリシーのバージョンは 5 個までしか保持できない。上限に当たったら
> `aws iam list-policy-versions` → `delete-policy-version` で古いものを消す。

## 何を許可しているか

| 用途 | リソース |
|---|---|
| seed(`scripts/seed/seed-projects.mjs`) | DynamoDB `portfolio-projects` |
| uraneko 管理 GUI / CLI | DynamoDB `uraneko-*`(GSI 含む)、S3 `uraneko-assets-<account>`、Secrets `uraneko/order-access-secret` |
| OmniVerse 配信・relations 反映 | S3 `rou39-site` |
| アクセス解析 | S3 `rou39-cloudfront-logs` / `uraneko-access-logs-*` / `notes-access-logs-*`(読み取り) |
| 調査 | CloudFront・CloudFormation・Lambda・API Gateway・CloudWatch・IAM の Get/List(メタデータのみ) |
| 自分の鍵の管理 | 自ユーザーの access key 作成・削除 |

## 何を明示的に拒否しているか

**Stash Notes のデータ**は明示 `Deny` で落としている。ローカルツールは1つも触らないのに、
以前は `AdministratorAccess` で全部読める状態だった。
notes は機密を置く前提の product なので、ノートPCの侵害が即データ流出にならないようにしておく。

- DynamoDB `notes-*`(`notes-memos` / `notes-tabs` / `notes-tokens` / `notes-users` / `notes-access-logs`)
- Secrets Manager `notes/*`
- CloudWatch Logs `/aws/lambda/Notes*` の中身(`GetLogEvents` / `FilterLogEvents` / `StartQuery`)

明示 `Deny` は他のどの `Allow` にも勝つので、あとから雑に権限を足しても notes は開かない。

> S3 の `notes-access-logs-<account>` は**許可**している。こちらは CloudFront の
> アクセスログ(パスと IP)で、メモの中身ではない。秘密URLのトークンは
> `location.hash` にありサーバへ送られないので、このログには残らない。

## できなくなったこと

- **ローカルからの `cdk deploy`**。通常デプロイは CI(OIDC)が行う。緊急時は root で
- `aws iam` の変更系、その他の管理操作。調査用の Get/List は残してある

必要になったら、このポリシーに足すか、root で一時的に対応する。
**ローカルツールを増やして新しいリソースに触るときは、このポリシーの更新を忘れないこと。**

## 履歴

- **2026-08-05**: `AdministratorAccess` を剥がして `portfolio-local-tools` に差し替え。
  アクセスキーをローテーション。未使用のアクセスキー2本(`@kuronekorou39` の 2023-10 以降
  未使用のもの、`uraneko-ghost-code-ingest` の未使用のもの)を削除。
  GitHub Secrets から未使用の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` /
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を削除(`ALERT_EMAIL` のみ現役)。
