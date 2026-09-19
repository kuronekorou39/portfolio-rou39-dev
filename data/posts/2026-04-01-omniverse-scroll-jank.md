---
title: OmniVerse: スクロール中のカクつきを JSON 解析の分離で減らした
summary: 約 650KB の応答の json.decode を別 Isolate に移し、スクロールの慣性も見直した
projects: [omniverse]
---

OmniVerse は、X と Bluesky のタイムラインを 1 つにまとめて読む Flutter 製の SNS クライアント。X の GraphQL 応答は約 650KB あり、解析のあいだメインスレッドが止まって、スクロールが 200〜500ms カクついていた。

![JSON 解析を UI スレッドの外へ](/devlog/2026-04-01-omniverse-scroll-jank/isolate-lanes.svg)

| 変更 | 中身 |
|---|---|
| JSON 解析を別 Isolate へ | compute() で json.decode を UI スレッドの外に出した |
| 移す範囲を絞った | パーサごと移すとユーザー情報が壊れうるため、json.decode だけにした |
| カードの再描画を独立 | 投稿カードを RepaintBoundary で包んだ |
| 慣性を滑らかに | friction を 0.015 から 0.008 にした |

慣性を変えた直後、スクロールが止まっても投稿をタップできなくなった。速度ゼロでも Simulation を返し続け、「アニメーション中」と見なされていたのが原因。速度ゼロでは null を返すようにして直した。
