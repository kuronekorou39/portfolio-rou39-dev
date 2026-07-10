# frontend-uraneko

`uraneko.rou39.com`(動画販売サブドメイン)の SPA。

本家 `frontend/` とは完全に独立したプロジェクト。

## Cognito(uraneko 専用 UserPool)

会員基盤は本家と分離した uraneko 専用 UserPool(`UranekoAuthStack` / `uraneko-users`)を使う。
認証ドメインは `https://uraneko-auth.rou39.com`。

UserPool ID / App Client ID は `src/lib/auth.ts` の `USER_POOL_ID` / `CLIENT_ID` に直書きしている
(本家 `frontend/` と同じ方式。SPA 用のこれらの ID はバンドルに露出する公開値で秘密ではない)。
環境変数には依存しないので、クリーンビルドでもそのまま正しくビルドできる。

`UranekoAuth` スタックを(再)デプロイして ID が変わった場合は、
CfnOutput `UranekoUserPoolId` / `UranekoUserPoolClientId` の値を
`src/lib/auth.ts` の `USER_POOL_ID` / `CLIENT_ID` に反映する。

注意: API Gateway(REST)はオーソライザーの設定変更(参照プールの変更等)だけでは
稼働中のステージに反映されない。CDK デプロイ後に
`aws apigateway create-deployment --rest-api-id <id> --stage-name prod` で
ステージを再デプロイすること(エッジ最適化型のため反映まで数分かかる)。

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
