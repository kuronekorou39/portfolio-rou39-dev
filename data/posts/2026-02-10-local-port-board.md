---
title: macOS に対応し、日英を切り替える
summary: OS ごとの処理を分けて macOS でも動くようにし、日本語と英語の切り替えとテストを足した
projects: [local-port-board]
---

ポートの取得とプロセスの終了を OS ごとのファイルに分け、macOS でも動くようにした。macOS では lsof で取得する。画面は日本語と英語を設定で切り替えられる。Rust のテストを 92 件、画面側のテストを 13 件用意し、CI で Windows と macOS のビルドを確かめる。
