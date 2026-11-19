---
title: 埋め込まれたプレイヤーでも動くように
summary: 他のページに埋め込まれた YouTube と Twitch のプレイヤーでも広告を送れるようにした
projects: [ad-skipper-twitch, ad-skipper-youtube]
---

content script を埋め込みフレームにも入れ、他のページに埋め込まれた YouTube や Twitch のプレイヤーでも広告を送れるようにした。Twitch の差し替えは本体ページの DOM 頼みで埋め込みでは成り立たないため、通信の層で広告を除く MIT ライセンスのスクリプトを無改変で同梱し、併用する。プレイヤーの無いフレームでタイマーが回り続けないよう、待ちに上限を付けた。
