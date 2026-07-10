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
frontend/          本家 rou39.com の React SPA
frontend-uraneko/  uraneko.rou39.com(動画販売サブドメイン)の SPA
backend/           Lambda関数(本家 + handlers/uraneko)
infra/             CDK スタック定義(本家 lib/ + uraneko は lib/uraneko/)
shared/            共有型定義
data/              projects.json(作品データの正。CI が DynamoDB に反映)
docs/              要件・仕様・外部契約ドキュメント
scripts/
  uraneko/         uraneko 運用管理(CLI・ローカルGUI・E2E用webhook)
  relations/       /relations 用データ加工(生データはリポジトリ外)
  seed/            作品データ投入(CI が実行)
tools/             project-editor.html(data/projects.json のローカル編集GUI)
relations-data/    relations 用生成データ置き場(git 管理外・S3 へ直接アップロード)
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
node scripts/seed/seed-projects.mjs
```

`data/projects.json` の編集には `tools/project-editor.html` をブラウザで開いて使う。
