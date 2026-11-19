---
title: 共通部分をまとめ、lint とテストと CI を入れた
summary: 3 つの拡張の重複を共通パッケージへ移し、ESLint・Prettier・テスト・CI を入れた
projects: [ad-skipper-twitch, ad-skipper-prime, ad-skipper-youtube]
---

3 つの拡張が個別に持っていたオーバーレイとポップアップの部品を、共通パッケージへ移した。ESLint・Prettier・GitHub Actions の CI を入れ、広告の残り時間の解析にテストを足して計 45 件にした。YouTube 用はボタンのクリックが効かないため広告の末尾へシークする方式に替え、広告後に再生を再開する。Prime Video 用は残り 2 秒で等速に戻す。
