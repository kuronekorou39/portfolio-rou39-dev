# frontend-uraneko

`uraneko.rou39.com`(動画販売サブドメイン)の SPA。

本家 `frontend/` とは完全に独立したプロジェクト。

## Cognito App Client ID

Cognito の App Client ID は `src/lib/auth.ts` の `CLIENT_ID` に直書きしている
(本家 `frontend/` と同じ方式。SPA 用 App Client ID はバンドルに露出する公開値で秘密ではない)。
環境変数には依存しないので、クリーンビルドでもそのまま正しくビルドできる。

`UranekoAuthClient` スタックを作り直して ClientId が変わった場合のみ、
`cdk deploy UranekoAuthClient` の CfnOutput `UranekoUserPoolClientId` の値を
`src/lib/auth.ts` の `CLIENT_ID` に反映する。

## 本番デプロイ

CI(`.github/workflows/deploy.yml`)は本家 frontend のみビルドし、frontend-uraneko は
ビルドしない(`UranekoFrontendStack` は `dist` 不在時は既存を温存)。
フロント変更を本番反映するには、ローカルでビルドしてから uraneko フロントを個別デプロイする:

```
npm install
npm run build          # dist/ を生成(CLIENT_ID は直書きなので env 不要)
cd ../infra && npx cdk deploy UranekoFrontend
```

## ローカル開発

```
npm install
npm run dev
```

`/api` は `uraneko.rou39.com` にプロキシされる(`vite.config.ts`)。
ローカルで Lambda を叩きたい場合は API Gateway の prod URL に向けても良い。
