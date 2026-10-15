# Stash Notes の利用枠(プラン)

notes.rou39.com の上限はプラン別。決済は無く、premium は運営者が手で付ける。

## 上限

| | free(既定) | premium |
|---|---|---|
| メモ(秘密URL)数 | 10 | 100 |
| 1メモのタブ数 | 10 | 40 |
| 1タブの本文 | 60 KB | 60 KB(プランで変えない) |

値の正は `backend/src/lib/notes/limits.ts` の `PLAN_LIMITS`。1タブの本文は、退出時フラッシュ
(fetch keepalive)の 64KB 制限と DynamoDB の 400KB item 制限が根拠なので、容量はタブ数を
増やす方向で確保する。

## 仕組み

- プランは `notes-users` の `plan` 属性(`'free' | 'premium'`、無ければ free)。
- **メモ数**は発行時(`issueMemo`)に users 行を読んで上限を決め、カウンタの条件付き ADD で強制する。
  条件には読んだ時点のプランを含めるので、読みと予約の間にプランが変わっても取り違えない。
- **タブ数**は未認証の create-tab Lambda が users を読めない(最小権限)ため、発行時にメモ側へ
  `tab_limit` として刻印し、`tab_count < tab_limit` の条件で強制する。刻印の無い旧メモは free 扱い。
- **プラン変更後の追従**: 所有者が管理画面を開く(`GET /admin/memos`)と、プランと食い違う
  `tab_limit` を所有メモに刻み直す。つまりプランを変えたら一度ダッシュボードを開けば全メモに反映される。
- メモ画面は `GET /m/get` の応答 `tab_limit` を使ってタブ追加ボタンの出し分けをする。

## premium を付ける手順(運営者)

ローカルの IAM は `notes-*` テーブルを明示 Deny しているので(`docs/local-aws-access.md`)、
AWS コンソールで行う。

1. DynamoDB → テーブル `notes-users` → 項目を探索 → 対象の `user_id`(Cognito の sub)を開く。
   sub は Cognito ユーザープール `notes-users` のユーザー一覧、または管理画面ログイン後の
   ID トークンから分かる。
2. 属性 `plan` を文字列 `premium` で追加(または変更)して保存。
3. 対象ユーザーで https://notes.rou39.com のダッシュボードを開く(所有メモの `tab_limit` が刻み直される)。

戻すときは `plan` を削除するか `free` にして、同じくダッシュボードを開く。既に上限を超えている
メモはそのまま残り、新規追加だけが止まる。
