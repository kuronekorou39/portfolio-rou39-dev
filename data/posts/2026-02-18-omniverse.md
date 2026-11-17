---
title: X と Bluesky を 1 本に並べる試作を作る
summary: 両 SNS のタイムラインを時系列で統合表示する試作を Flutter で作った
projects: [omniverse]
---

X と Bluesky を行き来する手間をなくすため、両方のタイムラインを 1 本にまとめるアプリの試作を作った。最初は各 SNS に WebView でログインし、画面から投稿を抜き出す方式にした。

- 時系列に並べ、重複を除いた統合フィードを表示
- Cookie を保存し、一定間隔で取り直す
