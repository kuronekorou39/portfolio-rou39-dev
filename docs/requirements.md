# ポートフォリオサイト 要件定義書

## 1. プロジェクト概要

個人で開発した多様なアプリケーション（Webアプリ、モバイルアプリ、ブラウザ拡張機能など）を展示し、誰でもアクセス・ダウンロードできるポートフォリオ兼ショーケースサイト。
ユーザーからのフィードバックを得るため、星評価付きのレビュー機能を実装する。
AWSサーバーレス構成で構築し、インフラ設計力のアピールも兼ねる。

## 2. 技術スタック

| 要素 | 技術 |
|---|---|
| フロントエンド | React SPA（Vite + TypeScript） |
| スタイリング | Tailwind CSS |
| ホスティング（フロント） | S3 + CloudFront |
| バックエンドAPI | Lambda + API Gateway |
| データベース | DynamoDB |
| 認証 | Cognito（メールアドレス登録 + Google OAuth） |
| ファイルストレージ | S3 |
| 画像処理 | Lambda（アップロード時に自動リサイズ・最適化） |
| IaC | CDK（TypeScript） |
| CI/CD | GitHub Actions |
| ドメイン | Route 53（将来対応） |

### 技術選定の経緯

- **React SPA（Next.jsではなく）**: 不特定多数が検索で来るサイトではなく、URL直接共有が主な導線のためSSR不要。フロント/バックを完全分離し、AWSアーキテクチャとしてシンプルかつ説明しやすい構成にする。
- **DynamoDB（RDBではなく）**: アクセスパターンが予測可能。Lambdaとの相性が良く、低トラフィック時のコストがほぼゼロ。
- **CDK（TypeScript）**: フロント・バックエンド・インフラをすべてTypeScriptで統一。

## 3. コア機能要件

### 3.1. プロダクト展示機能

* 以下の多様なプロダクトを一覧・詳細表示できること。
  * **Webアプリ:** U2B Loop, Cryptid Assistant など
  * **モバイルアプリ:** Koko-Meshi, mobile-omniverse, Memoria など
  * **拡張機能・ツール:** Domain Traffic Inspector, mobile-bex など
* 各プロダクトの詳細ページには、説明文（Markdown）、使い方（Markdown）、スクリーンショット、および適切なアクセス手段（Webリンク、ストアリンク、S3ダウンロードなど）を配置する。
* GitHubでprivateにしているアプリはS3経由でダウンロード配布する。

### 3.2. レビュー機能（ログイン必須）

* レビュー投稿にはCognito認証（メール登録 or Google OAuth）を必須とする。
* 星評価（0.0〜5.0）+ テキストコメント。
* 自分の投稿のみ編集・削除可能。
* ボット対策はCognito認証に任せる。

### 3.3. 訪問数カウント

* 各プロダクトのページビュー数を記録・表示する。

### 3.4. トップページ

* Apple・任天堂を参考にした洗練されたデザイン。
* スクロールアニメーション、大きなビジュアル、余白を活かした構成。
* デザイン・アニメーション技術のアピールに特化。

### 3.5. 拡張性

以下の構想を将来追加できるよう、拡張性を重視した設計にする：
* GitHubの草（コントリビューション）ウィジェット
* 開発予定（ロードマップ）
* 仕事の依頼受付
* 広告
* その他

## 4. 画面構成

| パス | ページ | 備考 |
|---|---|---|
| `/` | トップページ | デザイン・アニメーション全力 |
| `/apps` | アプリ一覧 | カテゴリ・タグでフィルタ |
| `/apps/:id` | アプリ詳細 | 説明、How to、スクリーンショット、レビュー |
| 将来追加 | About、Roadmap、Contact 等 | 拡張性を確保 |

## 5. データモデル（DynamoDB）

### projects テーブル

```typescript
{
  id: string;                    // URL用スラッグ（例: "koko-meshi"）
  title: string;                 // 表示名
  subtitle: string;              // 一言キャッチコピー（一覧画面用）
  description: string;           // 詳細説明（Markdown）
  howToUse: string;              // 使い方（Markdown）
  category: string;              // "web" | "mobile" | "extension" | "tool" | "other"
  tags: string[];                // 技術スタック・自由タグ（フィルタ用）
  platform: string[];            // 対応プラットフォーム
  icon: string;                  // S3 アイコンURL
  screenshots: string[];         // S3 スクリーンショットURL（複数）
  links: {
    github?: string;             // リポジトリURL（publicの場合）
    web?: string;                // WebアプリURL
    appStore?: string;           // App Store URL
    playStore?: string;          // Google Play URL
    download?: string;           // S3ダウンロードURL（private配布用）
  };
  status: string;                // "active" | "development" | "archived"
  publishedAt: string;           // 公開日
  updatedAt: string;             // 最終更新日
}
```

### reviews テーブル

```typescript
{
  id: string;                    // レビューID
  projectId: string;             // 対象プロダクトID
  userId: string;                // Cognito ユーザーID
  userName: string;              // 表示用ユーザー名（非正規化）
  rating: number;                // 星評価（0.0〜5.0）
  content: string;               // レビュー本文
  createdAt: string;             // 投稿日時
  updatedAt: string;             // 更新日時
}
```

### pageViews テーブル

```typescript
{
  projectId: string;             // 対象プロダクトID
  count: number;                 // 累計訪問数
}
```

## 6. プロダクトデータの管理

* 管理画面は作らない。
* CLIスクリプトまたはAWSコンソールから直接DynamoDBに登録・編集する。
* 画像はS3にアップロード。アップロード時にLambdaで自動リサイズ・最適化される。
* 必要に応じて将来管理画面を追加する。

## 7. AWS構成図（概要）

```
[ユーザー]
    │
    ▼
[CloudFront] ─── [S3: フロントエンド（React SPA）]
    │
    ▼
[API Gateway] ─── [Lambda: バックエンドAPI]
    │                   │
    │                   ├── [DynamoDB: projects, reviews, pageViews]
    │                   ├── [S3: 画像・ファイルストレージ]
    │                   └── [Cognito: 認証]
    │
    ▼
[Lambda: 画像リサイズ] ─── [S3トリガー: アップロード時に自動実行]
```

## 8. 実装フェーズ

### フェーズ1: 基盤構築
1. CDKでAWSインフラを定義（S3, CloudFront, API Gateway, Lambda, DynamoDB, Cognito）
2. Vite + React + TypeScript + Tailwind CSS のプロジェクト初期化
3. CI/CD（GitHub Actions）でフロント・バックエンドの自動デプロイ

### フェーズ2: コア機能
4. プロダクトデータのAPI（CRUD）とデータ登録スクリプト
5. アプリ一覧画面・詳細画面のUI
6. 画像アップロード・自動リサイズ機能

### フェーズ3: ユーザー機能
7. Cognito認証（メール登録 + Google OAuth）
8. レビュー機能（星評価 + テキスト、投稿・編集・削除）
9. 訪問数カウント

### フェーズ4: トップページ・仕上げ
10. トップページのデザイン・アニメーション実装
11. 独自ドメイン（Route 53）対応
12. 将来機能の追加（GitHub草、ロードマップ等）
