# frontend-uraneko

`uraneko.rou39.com`(動画販売サブドメイン)の SPA。

本家 `frontend/` とは完全に独立したプロジェクト。

## デプロイ後の初期設定

1. `cdk deploy UranekoAuthClient` の CfnOutput `UranekoUserPoolClientId` をコピー
2. ビルド時に環境変数で渡す: `VITE_URANEKO_CLIENT_ID=<client_id> npm run build`
   もしくは `src/lib/auth.ts` の `CLIENT_ID` 既定値を差し替え

## ローカル開発

```
npm install
npm run dev
```

`/api` は `uraneko.rou39.com` にプロキシされる(`vite.config.ts`)。
ローカルで Lambda を叩きたい場合は API Gateway の prod URL に向けても良い。
