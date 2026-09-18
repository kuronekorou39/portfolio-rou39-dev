---
title: Vloom: ブラウザ版の受信を 2.7 倍速くした
summary: インストール不要の Web 版の受信を、走査 3.6 fps から 9.9 fps に
projects: [vloom]
---

カメラで撮るだけでファイルが渡る Vloom。インストール不要の Web 版は受信が遅かったので詰めた。

![走査 fps の推移](/devlog/2026-09-18-vloom-pwa-receive/scan-fps.svg)

| | 結果 |
|---|---|
| 通し | 2.0MB を 49.4 秒(41.3 KB/s) |
| 効かなかった | SIMD、全画素コピーの削除 |
| 残り | ネイティブ版は 151.7 KB/s。まだ 3.7 倍の差 |
