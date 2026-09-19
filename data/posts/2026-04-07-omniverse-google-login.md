---
title: OmniVerse: Google ログインの白画面を、ポップアップ対応で直した
summary: WebView 内の Google 認証が白画面になる件。2 日かけて 5 通り試した
projects: [omniverse]
---

アカウント追加は、アプリ内の WebView でログインしてもらう方式。ここで「Google でログイン」を選ぶと白画面になっていた。前日から 2 日かけて直した。

| 試したこと | 結果 |
|---|---|
| User-Agent の Chrome を 120 から 131 に | 直らず |
| Google の認証だけ Chrome Custom Tabs で開く | Custom Tabs と WebView は cookie を共有しないため、成立しなかった |
| X-Requested-With ヘッダーを抑制 | 使っている WebView パッケージに設定が無かった |
| ポップアップを同じ WebView で開く | 逆効果で戻した |
| ポップアップをダイアログ内の新しい WebView で開く | 採用 |

ポップアップが閉じたことを検知し、3 秒待ってからログイン状態を確かめる。ログインを検知したら「このアカウントを追加しますか?」のモーダルを出すようにもした。

コードレビューの指摘も片付けた。デバッグログに出る認証ヘッダーと cookie の値をマスクし、Bluesky のいいね解除・リポスト解除を実装した。README は日本語で書き直した。
