---
title: iPad でのクラッシュを追う
summary: iPad で起きるクラッシュをログで特定し、WebView まわりの回避策を入れた
projects: [omniverse]
---

iPad で、ログイン時などにアプリが落ちる問題が出た。クラッシュログを取る仕組みを足して場所を特定し、JavaScript の呼び出し方を iPad 専用に変えた。
Google ログインのポップアップは全画面で開くようにし、WebView ライブラリの不具合にはパッチを当てた。v1.13.44 まで進んだ。
