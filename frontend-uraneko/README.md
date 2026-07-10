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

### プール分離の移行手順(2026-07、完了したらこの節は削除)

本家プール共有 → 専用プールへの切替は次の順で行う(順序を崩すとログイン不能期間が延びる):

1. Google Cloud Console で uraneko 用 OAuth クライアントを作成
   (承認済みリダイレクト URI: `https://uraneko-auth.rou39.com/oauth2/idpresponse`)。
   同意画面の表示名は GCP プロジェクト単位なので、uraneko 名義にしたい場合は別プロジェクトで作る
2. `infra/lib/uraneko/auth-stack.ts` の `GOOGLE_CLIENT_ID` を実値に更新
3. `cd infra && npx cdk deploy UranekoSecrets` →
   `aws secretsmanager put-secret-value --secret-id uraneko/google-oauth-client-secret --secret-string '<クライアントシークレット>'`
4. `npx cdk deploy UranekoAuth UranekoApi`(シークレット設定より後にデプロイすること。
   カスタムドメイン作成に15分程度かかる)
5. CfnOutput の `UranekoUserPoolId` / `UranekoUserPoolClientId` を `src/lib/auth.ts` に転記し、
   ビルドして `npx cdk deploy UranekoFrontend`(CSP の切替も一緒に反映される)
6. 動作確認(メール登録・Googleログイン・購入履歴)後、旧クライアントを削除:
   `aws cloudformation delete-stack --stack-name UranekoAuthClient`
7. `infra/lib/auth-stack.ts` の「一時措置」`exportValue` 行を削除してデプロイ
8. 旧プールの sub を持つテスト注文(`uraneko-orders` の `user_id` が `guest:` 以外)を掃除

手順 4 完了〜手順 5 完了の間、配信中の旧フロントはログインしても API に 401 で弾かれる
(fail-closed。ゲスト購入は影響なし)。ローンチ前のため許容。

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
