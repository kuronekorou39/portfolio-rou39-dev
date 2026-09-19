---
title: OmniVerse: スクロールするとヘッダーが光る件は、Material 3 の tint だった
summary: 通知ハイライトと紛らわしいヘッダーの色づきを、surfaceTint ごと無効にして消した
projects: [omniverse]
---

通知タブでリストをスクロールすると、ヘッダーがうっすら色づく。前日に作り直した通知ハイライトと紛らわしく、「ヘッダー全体がハイライトされる」ように見えていた。

| 試したこと | 結果 |
|---|---|
| AppBar の scrolledUnderElevation を 0、surfaceTintColor を透明に | まだ薄く光る |
| ColorScheme の surfaceTint 自体を透明に | こちらを採用。AppBar 以外の Material の tint もまとめて無効になる |

残っていた原因は、Material 3 が elevation に応じて ColorScheme.surfaceTint を自動で重ねる仕組みだった。

ハイライト本体も 2 点変えた。保持時間を 10 秒から 5 秒に縮めた。また、ほかのタブから通知タブに戻った瞬間に新着だけが光り直し、「上は消えたのに下が光る」状態になっていたので、光らせるのはアカウントのチップをタップしたときだけにした。

X のシステム通知(鈴マーク)は一覧には出すが、未読の件数には数えないようにした。
