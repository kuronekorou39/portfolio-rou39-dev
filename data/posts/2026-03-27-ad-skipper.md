---
title: サイトごとに別の拡張に分けた
summary: 1 つの拡張に同居していた Twitch と Prime Video を、別々の拡張にした
projects: [ad-skipper-twitch, ad-skipper-prime]
---

1 つの拡張に同居していた Twitch と Prime Video の処理を、別々の拡張に分けた。それぞれが manifest・ポップアップ・バージョンを持ち、片方だけ出し直せる。Prime Video 側は通信の監視が要らないので、その権限を外した。
