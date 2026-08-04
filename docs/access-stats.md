# アクセス解析(ローカル)

CloudFront の標準アクセスログ(S3)を集計して見るためのローカル専用ツール。
Google Analytics のような外部サービスは入れず、既に出しているログを読むだけ。

IP と User-Agent を表示するので**公開 Web には置かない**。127.0.0.1 のみで待受ける。

前提: AWS CLI / 環境変数で ap-northeast-1 に認証済みであること。

## GUI(推奨)

```bash
node scripts/access/access-server.mjs
```

→ ブラウザで **http://127.0.0.1:4174** を開く。
サイト(rou39 / notes / uraneko)と期間(7〜90日)を選んで「更新」。

uraneko の管理 GUI(4173)とはポートが別なので同時に起動できる。
ポート変更: `ACCESS_UI_PORT=5000 node scripts/access/access-server.mjs`

Host 検証 + Origin 検証で DNS リバインディングと CSRF を防いでいる(uraneko 管理 GUI と同じ方式)。

## CLI

```bash
node scripts/access/access-stats.mjs                 # rou39.com / 直近7日
node scripts/access/access-stats.mjs --days=30       # 期間を変える
node scripts/access/access-stats.mjs --site=notes    # サイトを変える (rou39 / notes / uraneko)

node scripts/uraneko/access-stats.mjs --days=30      # uraneko 専用の入口(従来どおり)
```

## 対象サイトとログの出どころ

| サイト | バケット | 有効化している場所 |
|---|---|---|
| rou39.com | `rou39-cloudfront-logs` | `infra/lib/frontend-stack.ts` |
| notes.rou39.com | `notes-access-logs-<account>` | `infra/lib/notes/frontend-stack.ts` |
| uraneko.rou39.com | `uraneko-access-logs-<account>` | `infra/lib/uraneko/frontend-stack.ts` |

いずれも prefix は `cf/`、90 日で自動削除。バケットを明示したいときは
`ROU39_LOG_BUCKET` / `NOTES_LOG_BUCKET` / `URANEKO_LOG_BUCKET` で上書きできる。

### notes の秘密URLについて

Stash Notes の共有トークンは `location.hash`(フラグメント)に載っている。
フラグメントはサーバに送られないので、**アクセスログに残るのは `/m` まで**で、
どのメモが開かれたかはログからは分からない。トークンが S3 に複製されることもない。

メモ単位の閲覧履歴が見たいときは、notes 自身が DynamoDB に持っている
アクセス記録(発行者・閲覧者が画面から見られるもの)を使う。こちらは別系統。

## 数え方(ここが要点)

**ページ表示** = GET・2xx/304 で HTML が返ったリクエスト。アセット(.js/.css/画像)と `/api` は除外。

**探索アクセスを分離している。**
SPA は存在しないパスにもトップページを 200 で返すため、`/wp-admin/install.php` や `/.env` への
スキャンも、そのままでは「ページ表示」として数えられてしまう。実際 rou39.com では
ページ表示とされた 2565 件のうち 2345 件がこの手の探索だった。

そこで `scripts/lib/cf-access-stats.mjs` の `SITES[].routes` に実在するルートを定義し、
一致しないパスは**探索アクセス**として日別・訪問者・リファラ・UA の集計から外している。
件数と宛先だけは別枠で表示する。

> ルートを追加・変更したら `SITES[].routes` も更新する。
> 載せ忘れたページは「探索アクセス」に落ちて集計から消える。

**パス別は「入口ページ」の内訳。**
SPA のクライアント側遷移はリクエストが飛ばないのでログに残らない。
トップから `/apps` に移動しても記録されるのは最初の 1 回だけ。
アプリごとの閲覧数が見たいときは、サイト側で数えている DynamoDB の
ページビュー(`/api/page-views/{id}`、アプリ一覧のカードにも出ている)を見る。

その他:

- 時刻はすべて JST 表示(ログ自体は UTC)
- ログ配信には数分〜数時間の遅れがある(直近分は未反映のことがある)
- 「ざっくり訪問者」はユニーク IP。同一人物の複数端末や CGNAT は分離できない

## 構成

| ファイル | 役割 |
|---|---|
| `scripts/lib/cf-access-stats.mjs` | 集計ロジック本体。サイト定義・パース・集計・CLI 表示 |
| `scripts/access/access-server.mjs` | ローカル GUI サーバ(127.0.0.1:4174) |
| `scripts/access/access-ui.html` | GUI の画面 |
| `scripts/access/access-stats.mjs` | CLI(サイト指定) |
| `scripts/uraneko/access-stats.mjs` | uraneko 用の薄い入口。管理 GUI もここから使う |
