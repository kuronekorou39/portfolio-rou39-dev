---
title: 広告スキッパー: 3 つの拡張の共通部分をまとめ、lint とテストと CI を入れた
summary: 重複していた UI コードを shared へ。ESLint、Prettier、テスト 45 件、CI
projects: [ad-skipper-twitch, ad-skipper-prime, ad-skipper-youtube]
---

3 つの拡張が同じコードを個別に持っており、lint もテストの自動実行も無かった。

![3 つの拡張が別々に持っていたコードを shared へ](/devlog/2026-04-11-ad-skipper-shared-and-ci/shared-package.svg)

| 変更 | 中身 |
|---|---|
| 共通化 | 広告中のオーバーレイと、ポップアップの UI 関数群を shared パッケージへ。20 ファイルで 877 行を削除 |
| lint と整形 | ESLint 9 と Prettier を導入。production ビルドの minify を有効にした |
| テスト | 広告の残り時間の解析と速度の調整を shared に抽出。15 件を足して計 45 件 |
| CI | GitHub Actions で push / PR のたびに lint → format → build → test |

機能面では、YouTube 版のスキップを、ボタンの click() から広告の末尾へシークする方式に替え、広告後は再生を自動で再開するようにした。Prime Video 版は広告の残り 2 秒で等速に戻し、本編への食い込みを防ぐ。3 つともポップアップを作り直し、オーバーレイのフェードは 0.15 秒から 0.5 秒にした。
