# Portfolio - rou39.dev

個人開発アプリのポートフォリオサイト。React SPA + AWSサーバーレス構成。

## 技術スタック

- **Frontend**: React (Vite) + TypeScript + Tailwind CSS
- **Backend**: Lambda + API Gateway
- **DB**: DynamoDB
- **Auth**: Cognito
- **Storage**: S3 + CloudFront
- **IaC**: CDK (TypeScript)

## ディレクトリ構成

```
frontend/   React SPA
backend/    Lambda関数
infra/      CDK スタック定義
shared/     共有型定義
scripts/    データ登録スクリプト
```

## セットアップ

```bash
npm install
```

## 開発

```bash
npm run dev
```

http://localhost:5173 でフロントエンドが起動。

## ビルド

```bash
npm run build
```

## AWSデプロイ

事前に AWS CLI の認証設定が必要。

```bash
# CDKの初回セットアップ（リージョンごとに1回）
cd infra && npx cdk bootstrap

# 全スタックをデプロイ
npm run deploy:infra
```

## データ登録

作品データは `data/projects.json` が正で、CI(deploy.yml)が push のたびに反映する。

```bash
# data/projects.json を DynamoDB に反映(CI と同じもの)
node scripts/seed-projects.mjs
```

`data/projects.json` の編集には `tools/project-editor.html` をブラウザで開いて使う。
