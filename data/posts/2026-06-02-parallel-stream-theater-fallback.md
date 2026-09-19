---
title: Parallel Stream: シアターモードの切替を 3 段のフォールバックにした
summary: ボタン、属性の書換、キー送信の順に試し、4 サイトのセレクタを実機で確定
projects: [parallel-stream]
---

配信を並べるには、各サイトのプレイヤーを画面いっぱいに広げたい。サイト自身のシアターモードを外から ON にする方法を、Twitch / YouTube / Kick / OPENREC の 4 サイトで確かめた。

![シアターモードを ON にする 3 段のフォールバック](/devlog/2026-06-02-parallel-stream-theater-fallback/fallback.svg)

| 順番 | 戦略 | 中身 |
|---|---|---|
| 1 | ボタンを click | Twitch は英語 UI の aria-label(Theatre / Theater)にも対応 |
| 2 | 属性の書換(サイト固有) | Kick は data-theatre 属性を書き換える。実機で元に戻されないことを確認 |
| 3 | キー送信(汎用) | 上の 2 つが効かないときの手段 |

最初に成功した戦略で止め、どれで成功したかを記録する。OPENREC は theater を含むクラス名の部分一致が入力欄にも当たり、動画が止まっていた。アイコンのクラスを直接指すセレクタに替えた。4 サイトとも目視で切替を確認した。
