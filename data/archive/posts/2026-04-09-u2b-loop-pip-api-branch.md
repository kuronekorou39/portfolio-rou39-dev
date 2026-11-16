---
title: U2B Loop: PiP の突入方法を API レベルで分けた
summary: 手動と自動の PiP 突入が競合していた。Android 12 以上は自動に全面委任
projects: [u2b-loop]
---

前日に壊したホームボタン PiP を直しつつ、タスク一覧からアプリを切り替えたときも PiP に入るようにした。

![PiP への入り方を API レベルで分ける](/devlog/2026-04-09-u2b-loop-pip-api-branch/pip-branch.svg)

| バージョン | 方式 |
|---|---|
| v1.38.7 | 手動突入用のパラメータは v1.37.1 のまま、自動 PiP 用を別に用意 |
| v1.38.8 | setAutoEnterEnabled を使わず onPause だけで入る(端末互換性の問題) |
| v1.38.9 | API 31 以上は setAutoEnterEnabled に全面委任、API 26〜30 は onUserLeaveHint と onPause で手動 |
| v1.38.10 | PiP 突入直後に再生状態を再同期 |

手動の突入と自動の突入が競合しており、API レベルで分けて解消した。ミニプレイヤーは、タップしても再生画面に戻らない不具合など 3 件を直し、プレイリストの自動進行と次曲のプリロードに対応した。プリロードが終わっていなければ、次へ進まずにループを続ける。
