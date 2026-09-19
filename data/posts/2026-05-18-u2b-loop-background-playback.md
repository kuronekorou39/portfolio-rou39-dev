---
title: U2B Loop: 画面を消しても再生が続くようにした
summary: wakelock と Foreground Service で再生を維持。ロック画面に操作ボタンも出す
projects: [u2b-loop]
---

スリープ中も再生が続くようにした。5 月 15 日の wakelock から始め、この日に Foreground Service と MediaSession まで入れた。

![画面を消しても再生を続ける 3 つの仕組み](/devlog/2026-05-18-u2b-loop-background-playback/keep-playing.svg)

| バージョン | 内容 |
|---|---|
| v1.59.0 | 再生中は wakelock で CPU のスリープを防ぐ。ヘッドホンや Bluetooth が切れたら自動で一時停止 |
| v1.59.1 | Foreground Service を実装。通知に曲名を出し、システムにプロセスを止められないようにする |
| v1.59.2〜3 | 画面オフでプレイヤーが自動で一時停止するため、500ms 後に再生を呼び直す |
| v1.60.0〜1 | MediaSession に対応。ロック画面と通知に再生 / 一時停止 / 前後スキップとサムネイル |

サービスは当初、再生状態に連動して起動・停止していたが、自動の一時停止でサービスまで止まる連鎖が起きた。再生開始時に起動し、画面を閉じたときに止める形に変えた。出力先(Bluetooth / ヘッドホン / スピーカー)のアイコンも操作バーに出す(v1.60.2)。
