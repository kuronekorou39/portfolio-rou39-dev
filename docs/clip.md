# Clip - テキスト共有サービス 要件定義

## 概要

スマホ間でテキストをログインなしで共有するための軽量Webサービス。
ポートフォリオサイトのサブページ (`/clip`) として公開する。

## ユーザーフロー

### 送信側

1. `rou39.com/clip` にアクセス
2. テキストを入力または貼り付け
3. 「リンクを生成」を押す
4. トークン付きURL（`rou39.com/clip/Ab3xK9`）とQRコードが表示される

### 受信側

1. URLにアクセス or QRコードをスキャン
2. テキストが即表示される → ワンタップコピー

## 機能要件

| 項目 | 内容 |
|------|------|
| 認証 | なし（匿名利用） |
| コード形式 | 英数字6文字（例: `Ab3xK9`） |
| テキスト上限 | 300KB（UTF-8バイト数で計測） |
| 有効期限 | 30分（DynamoDB TTLで自動削除。削除タイミングは最大48時間遅延の可能性あり） |
| 対応コンテンツ | プレーンテキスト（ソースコード、日本語、絵文字を含む） |
| QRコード | コード生成時に `rou39.com/clip/XXXXXX` のQRコードを表示 |

## 非機能要件

| 項目 | 内容 |
|------|------|
| レスポンス | テキスト保存・取得ともに1秒以内 |
| 可用性 | 個人利用のため厳密なSLAは不要 |
| コスト | AWS無料枠内で運用（月額0円想定） |
| スマホ対応 | モバイルファーストのレスポンシブUI |

## 技術スタック

| 要素 | 技術 | 備考 |
|------|------|------|
| フロントエンド | React（既存SPAにルート追加） | `/clip` を App.tsx に追加 |
| バックエンド | Lambda（TypeScript） | 既存 `backend/src/handlers/` に追加 |
| データベース | DynamoDB | 新テーブル（TTL有効化） |
| IaC | CDK（TypeScript） | 既存 `infra/` に追加 |
| API | 既存API Gatewayに `/clip` エンドポイント追加 | |
| ホスティング | 既存 S3 + CloudFront | |
| QRコード生成 | フロントエンド側ライブラリ（qrcode.react等） | |

## APIエンドポイント

```
POST /clip
  Request Body: { "text": "..." }
  Response:     { "code": "Ab3xK9" }
  Errors:
    400 — { "error": "text_required" }     テキストが空
    400 — { "error": "text_too_large" }    300KB超過
    429 — { "error": "rate_limited" }      レートリミット

GET  /clip/{code}
  Response:     { "text": "...", "createdAt": 1234567890 }
  Errors:
    404 — { "error": "not_found" }         コードが存在しない or TTL削除済み
```

## データモデル（DynamoDB）

**テーブル名:** `clips`

| 属性 | 型 | 説明 |
|------|----|------|
| code (PK) | String | 6文字の英数字コード |
| text | String | 保存されたテキスト |
| createdAt | Number | 作成日時（Unix timestamp） |
| ttl | Number | 有効期限（Unix timestamp、createdAt + 30分） |

## セキュリティ

- **コードの衝突回避** — 英数字6文字（62^6 ≈ 568億通り）。保存前にDynamoDBで既存チェック（ConditionExpression）
- **有効期限** — DynamoDB TTLで30分後に自動削除（実際の削除は最大48時間遅延する可能性あり。許容する）
- **リクエストボディ制限** — Lambda側で `Buffer.byteLength(text, 'utf-8') <= 300 * 1024` を検証
- **レートリミット** — API Gatewayの使用量プランで設定（100リクエスト/分）
- **CORS** — ポートフォリオドメインのみ許可

## フロントエンド

- 既存React SPAに2ルート追加: `/clip`（送信画面）、`/clip/:code`（受信画面）
- タブ切り替えは不要（URLベースでページ分離）
- ポートフォリオと統一したダークテーマ（`bg-[#060608]`、framer-motion）
- モバイルファースト設計
- 送信画面: テキスト入力 → リンク生成 → URL表示 + ワンタップコピー + QRコード表示
- 受信画面: URLアクセスでテキスト即表示 + ワンタップコピー

## デプロイ

- CDKで既存スタックにClip用リソースを追加（DynamoDBテーブル、API Gatewayルート、Lambda）
- CI/CDは既存のGitHub Actionsパイプラインに統合
