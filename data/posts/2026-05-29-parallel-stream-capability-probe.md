---
title: Parallel Stream: 拡張機能だけで作れるかを調べるプローブから始めた
summary: 複数配信を並べる拡張の前段として、ブラウザの能力を調べる拡張を作った
projects: [parallel-stream]
---

Parallel Stream は、複数のライブ配信を 1 画面に並べて見る Chrome 拡張。最初は動く製品ではなく、Android の Chromium 系ブラウザで、拡張機能だけでマルチビューを作れるかを実機で確かめる調査用の拡張(プローブ)として作った。

| プローブ | 調べること |
|---|---|
| api-surface | chrome.* を全列挙し、標準 API の一覧に無いものに印を付ける |
| windows-probe | chrome.windows.create を normal / popup / panel で呼び、並んだ別ウィンドウになるか |
| fullscreen-probe | ジェスチャ無しの requestFullscreen が通るか。配信サイトのシアターモードのボタンを押せるか |
| webview-probe | chrome.multiview など、独自の名前空間が露出していないか |

結果はポップアップに並べ、Markdown でコピーできる。翌日、fullscreen-probe が Promise を await しておらず、結果が pending のまま記録される不具合を直した。
