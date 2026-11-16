---
title: 広告スキッパー: 他のページに埋め込まれたプレイヤーでも動くようにした
summary: content script を埋め込みフレームにも注入し、それで出る副作用を潰した
projects: [ad-skipper-twitch, ad-skipper-youtube]
---

content script は、既定では最上位のフレームにしか注入されない。そのため、他のページに埋め込まれた YouTube や Twitch のプレイヤーには届いていなかった。

![content script を埋め込みフレームにも注入する](/devlog/2026-08-02-ad-skipper-embedded-frames/all-frames.svg)

| 変更 | 中身 |
|---|---|
| all_frames | YouTube 版と Twitch 版の content script を、埋め込みフレームにも注入する |
| ポップアップの状態取得 | 最上位フレームを優先して問い合わせる。チャットなどのサブフレームが先に応答してしまうため |
| プレイヤー待ちの上限 | プレイヤーを持たないフレームで 1 秒タイマーが永久に鳴り続けるので、試行回数に上限を付けた |
| Twitch 版の方式 | DOM に依存しない第三者のスクリプト(MIT)を無改変で同梱し、LICENSE の全文を併記 |

Twitch 版の自作の方式は、本体ページの DOM に依存していて埋め込みでは成立しない。両者は併用できる。別環境でビルドが失敗した件は、npm ci で入れ直せば直ることを README に書いた。
