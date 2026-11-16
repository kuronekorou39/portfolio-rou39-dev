---
title: OmniVerse: iPad だけログインで落ちる件を、プラグインへのパッチで直した
summary: iPadOS 17 の WKWebView でネイティブクラッシュ。ログを仕込んで 1 日で 10 版出した
projects: [omniverse]
---

iPad(iPadOS 17.7.10)でだけ、X へのログイン後と Google ログインのポップアップでアプリが落ちた。ネイティブ側のクラッシュで Dart からは見えないため、まず未処理例外をログに残す仕組みと、1 行単位の通過ログを入れた。

![iPad だけ、WebView での JS の呼び方を分けた](/devlog/2026-04-23-omniverse-ipad-crash/ipad-branch.svg)

| 試したこと | 結果 |
|---|---|
| ユーザー情報の取得を JS ブリッジから HTTP 直叩きに | Android のログインが壊れ、戻した |
| iPad で evaluateJavascript が動くかの実験コード | 動く。落ちるのは callAsyncJavaScript だけと確認 |
| iPad だけ evaluateJavascript + ポーリングに分岐 | 採用。iPhone と Android の経路は変えていない |
| ポップアップを Dialog から全画面ルートに | 効かず、戻した |
| WebView プラグインに未マージの修正をパッチで当てる | 原因に当たった |

ポップアップのほうは、プラグインの既知の不具合だった。ポップアップ用の子 WebView で初期化が一部飛ばされ、iOS 14〜17 で不正アクセスになる。iOS 18 以降では起きない。上流の修正はまだマージされていないので、CI でビルドするときに差分を当てるスクリプトを足した。
