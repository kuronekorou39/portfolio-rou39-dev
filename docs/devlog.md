# Devlog(開発ログ)

本家サイトの `/devlog`。その日に進んだことを、アプリごとに 1 日 1 件、短く書く。
タイムライン(`/timeline`)で作業のあった日を押すと、その日のログのタイトルが出て、そこからログを開ける。

## 記事の置き場所と形式

正本は `data/posts/*.md`。サイトには焼き込まず、**実行時に読む**。

- `scripts/content/build-content.mjs` が全ログを検査し、配信用のファイルを `frontend/public/content/devlog/` に書き出す
  (`index.json` = 一覧用のメタ情報、`posts/<slug>.md` = 本文)。生成物は git で管理しない
- サイトは一覧で `index.json` を、ログを開いたときにその 1 本の本文を取得する(`frontend/src/lib/posts.ts`)
- 手元では `npm run dev` / `npm run build` の前に自動で生成される。検査だけなら `node scripts/content/build-content.mjs --check`

### 公開のしかた

公開の経路は 2 つ。**どちらも `scripts/content/publish-devlog.mjs` で S3 に上げる**(検査 → 生成 → 同期)。

#### 手元から公開する(GitHub に依存しない)

```bash
npm run publish:devlog              # 検査 → 生成 → rou39-site へ同期。5 分以内にサイトへ出る
npm run publish:devlog -- --dryrun  # S3 に何をするかだけ表示する
```

- リポジトリが private で Actions が動かない(課金ロックなど)ときでも公開できる。commit / push は後でよい
- キャッシュは消さない。ログと図に `Cache-Control: public, max-age=300` を付けて上げ、CloudFront はその時間で取り直す。
  そのため手元の権限(`portfolio-local-tools` の rou39-site への書き込み)だけで足りる
- **`--delete` で同期するので、手元に無いログは配信から消える。** 別の端末で足したログがあるなら先に pull する
- アプリのデータ(`data/projects.json`)と `frontend/public/projects/` は対象外。こちらは push(下)か `node scripts/seed/seed-projects.mjs`

#### main へ push する

`.github/workflows/deploy.yml` が、push で変わった場所を見て経路を選ぶ。

| 変わった場所 | 経路 | 所要 |
|---|---|---|
| `data/posts/`、`data/projects.json`、`data/activity.json`、`data/goals.json`、`frontend/public/devlog/`、`frontend/public/projects/` **だけ** | 中身だけの経路: 検査 → 生成 → S3 へ同期 → そのパスだけ invalidate → アプリのデータを投入 | 1〜2 分 |
| それ以外が 1 ファイルでも含まれる | フルデプロイ(ビルド + CDK)。中身も一緒に載る | 10〜20 分 |

どちらの経路も最後に `publish-devlog.mjs --invalidate` を通す(フルデプロイでは CDK が印なしで上げたログを、印付きで上げ直す)。

**ログの追加は、仕組みの変更と同じ push に混ぜない。** 混ぜるとフルデプロイになる。
**検査に 1 件でも落ちると、その push では何も載らない**(下の「何を書くか」「書くときのルール」を機械的に見ている)。push の前に `--check` を回す。

ファイル名は `YYYY-MM-DD-<slug>.md`。slug は半角の小文字・数字・ハイフンのみ。アプリの id をそのまま使う(例: `2026-03-07-koko-meshi.md`)。
この形式に合わないファイルは検査で落ちる。**日付はファイル名が正**(並び順と表示に使う)。

```markdown
---
title: 記事のタイトル
summary: 一覧に出す1行の要約
projects: [vloom, hayabuzz]
---

本文(Markdown)。見出しは `##` から。
```

| キー | 必須 | 内容 |
|---|---|---|
| `title` | ○ | その日にやったことを **30 字以内**で。アプリ名は入れない。無いと記事として扱われない |
| `summary` | | 一覧に出す1行 |
| `projects` | | 関連するアプリの id(`data/projects.json` の `id`)。記事の頭にアプリページへのリンクが出る |

frontmatter は `key: value` と `[a, b]` の配列だけを読む簡易パーサ。YAML の入れ子や複数行は使えない。

## 退避したログ(2026-11-16)

整理し直すため、それまでの 208 本と全アプリをいったん引っ込めた。消してはいない。

- ログ: `data/archive/posts/`、図: `data/archive/devlog-figures/`。検査と公開の対象外
- アプリ: `data/projects.json` で全件 `published: false`。それまで公開していた id は `data/archive/published-before.json`
- 戻すときは、ログを `data/posts/` へ、図を `frontend/public/devlog/<slug>/` へ移し、アプリを `published: true` にする
  (ログは、公開中のアプリのものしか検査を通らない)

## 遅れを確かめる

```bash
npm run status            # アプリごとに、最後のログより後の作業日数と、古いダウンロード先を出す
npm run status -- --json  # 日ごとのコミット数まで出す(ログの下書きの材料)
```

アプリとリポジトリの対応は `data/sources.json`。アプリを足したらここにも足す
(`projects.json` は API でそのまま公開されるので、リポジトリ名はそちらに書かない)。

## タイムライン

`/timeline` は、アプリ(縦)× 日付(横)の表。アプリごとに「予定」と「実績」の 2 行を持つ。

- 予定: 目標ごとに、着手日から期限までのバー。期限を過ぎたぶんは赤い斜線で伸びる
- 実績: ひと続きの作業を 1 本のバーにし、中を日ごとのコミット件数の濃淡で塗る。ログのある日は白い点
- 左端は 2025-01-01。作業のあった日を押すと、その日のログのタイトルが吹き出しで出る

### 目標を書く

正本は `data/goals.json`。1 件が 1 つの目標。

```json
[
  { "project": "mobile-bex", "title": "Chromium 156 に追従する", "start": "2026-11-18", "due": "2026-11-30" }
]
```

| キー | 必須 | 内容 |
|---|---|---|
| `project` | ○ | アプリの id |
| `title` | ○ | 何をやるか。バーにマウスを乗せると出る |
| `start` / `due` | ○ | 着手日と期限(YYYY-MM-DD) |
| `done` | | 終えた日。書くと「完了」になり、期限より後なら遅れた日数が出る |

目標はサイトにそのまま出る。外に出せないことは書かない。形式に違反すると、ログと同じく何も載らない。

### 実績を集める

```bash
npm run activity          # 公開中のアプリのコミット件数(直近 180 日)を集め、data/activity.json に書く
npm run activity -- --since 2025-01-01   # アプリを新しく公開したときは、表の左端から集め直す
npm run publish:devlog    # ログと一緒にサイトへ出す(push でも出る)
```

- 集めるのは手元の gh の認証。private のリポジトリも数えられる。外に出るのは日付と件数だけ
- 自動では更新されない。ログを書く前に `npm run activity` を回す
- アプリを公開に切り替えたら回し直す(非公開のアプリは集めない)

## 何を書くか

**1記事で1つのアプリを取り上げ、そのアプリに加えた更新を載せる。** サイト自体の更新報告や、複数アプリの変更の羅列にはしない。

- **本文は簡潔に。40〜300 字。** 「何を変えたか・なぜか」を 2〜4 文、または箇条書き 2〜4 行。見出しは要らない
- 図は任意。見せたほうが早いときだけ 1 枚置く(様式は下の「図の様式」)。置いたら一覧の見出し画像にもなる
- 表も任意
- **表は見出し行を必ず付け、1つの表で1つのことだけを示す。**(例: やったこと / 数値 / 中身)。種類の違う情報を1つの表に寄せ集めない
- 材料はそのアプリのリポジトリのコミットと記録。測れるものは数字で

## 書くときのルール

- **材料にしてよいのは、`data/projects.json` に載っているアプリのリポジトリだけ。** 業務のリポジトリや未掲載のリポジトリの内容・名前は書かない
- 本リポジトリの記事は公開される。顧客名・ホスト名・パス・トークンなど、外に出せないものを書かない
- アプリごとに 1 日 1 件。何も進まなかった日は書かない
- **「作品」とは書かない。「アプリ」と書く**(気取って聞こえるため)。「記事」より「ログ」
- 文体はアプリページの説明文に合わせる(だ・である調、短く、結論から)
- 表は GFM の表が使える(`remark-gfm`)
- 画像は `frontend/public/devlog/<slug>/` に置き、`/devlog/<slug>/xxx.svg` で参照する

## 図の様式(SVG を手描きするとき)

見本: `data/archive/devlog-figures/2026-09-07-vloom-pwa-receive/scan-fps.svg`(グラフ)、
`data/archive/devlog-figures/2026-08-24-hayabuzz-question-formats/choices-flow.svg`(流れ + 画面のラフ)

- `viewBox="0 0 720 <高さ>"`、高さは 200〜460。`font-family="system-ui, sans-serif"`。最初に地の色の `<rect>` を全面に敷く(`#0b0c10`)
- 色: 強調は `#60a5fa` の 1 色だけ(今回足した・変えた部分に使う)。それ以外は白の不透明度で濃淡をつける(見出し 0.85 / 本文 0.6 / 補足 0.4 / 枠線 0.12 / 面 0.04)。不具合や「直す前」を示すときだけ `#f87171` を使ってよい
- 左上に図の題(15px / 700)。箱は `rx="8"`〜`10`。矢印は `<marker>` で作り、線は 2px
- 文字は 11〜15px。**全角 1 文字の幅は font-size とほぼ同じ**なので、箱の幅から入る文字数を計算して収める。長い文は図に入れず本文に書く。文字は 30 個以内
- `transform`、`<script>`、`<foreignObject>`、`<image>`、外部参照は使わない
- 一目で分かる量にする。箱は 3〜7 個まで。本文の言い換えではなく、関係や位置を見せる
