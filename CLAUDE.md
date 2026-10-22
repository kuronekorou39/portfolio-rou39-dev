# CLAUDE.md

rou39.com(本家)・uraneko.rou39.com(動画販売)・notes.rou39.com(メモ)の 3 サイトを持つ npm workspaces のモノレポ。
フロントは `frontend*/`、Lambda は `backend/src/handlers/`(サブサイトは `handlers/<name>/`)、CDK は `infra/lib/`(同じく `lib/<name>/`)。

## 守ること

- **ローカルから `cdk deploy` しない。** 権限を絞ってあり通らない。確認は `cd infra && npx cdk synth` / `cdk diff` まで。デプロイは main への push で CI(`.github/workflows/deploy.yml`)が行う。ローカルで使える権限は `infra/policies/portfolio-local-tools.json` が正
- **notes の DynamoDB(`notes-*`)・Secrets(`notes/*`)・Lambda ログ本文はローカルから明示 Deny。** 意図的な設計なので Allow を足して回避しない
- **秘密情報をコミットしない。** シークレットは AWS Secrets Manager に置き、公開してよい値(クライアント ID 等)だけソースに直書きする
- `data/projects.json` がアプリ一覧の正本。同じアプリ内で `DownloadOS` を重複させない(API が先頭の 1 件しか返さない)
- Devlog(`data/posts/`)は書き方の検査があり、1 件でも違反すると何も載らない。ルールと公開手順は `docs/devlog.md`
- frontend-uraneko はインライン style 主体で `@media` を使わず、`useIsNarrow` で分岐する。UI を変えたら `frontend-uraneko/.claude/skills/verify/SKILL.md` に従いブラウザまで確認する

## コマンド(分かりにくいものだけ)

```bash
npm run test --workspace=frontend   # テストは frontend にしか無い
npm run lint --workspace=frontend   # lint も frontend のみ
npm run build --workspace=backend   # backend の型チェック
npm run publish:devlog              # Devlog を手元から公開(GitHub を通さない)
node scripts/seed/seed-projects.mjs # data/projects.json を DynamoDB へ反映
```

`video/`(Remotion)はルートの workspaces に入れていない。触るときは `video/` 内で個別に `npm install`。
