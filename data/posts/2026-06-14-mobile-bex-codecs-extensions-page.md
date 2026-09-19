---
title: BEX: ライブ配信が再生できるようにし、拡張機能の管理ページをスマホ幅にした
summary: H.264/AAC を同梱して配信を再生。chrome://extensions を 1 カラムに
projects: [mobile-bex]
---

Twitch や YouTube のライブ配信がエラーで再生できなかった。実機で MediaSource.isTypeSupported('avc1,mp4a') が false を返しており、ビルドに H.264 / AAC が入っていないのが原因だった。拡張機能の管理ページも PC の幅のまま縮小表示され、ボタンが見切れていた。

![ライブ配信の H.264 と AAC をデコードする経路](/devlog/2026-06-14-mobile-bex-codecs-extensions-page/codec-path.svg)

| 変更 | 中身 |
|---|---|
| コーデックの同梱 | ビルド設定に proprietary_codecs と ffmpeg_branding を追加。H.264 は Android の MediaCodec、AAC は同梱の ffmpeg でデコードする |
| 拡張機能の有効化フラグ | enable_extensions は Android でビルド設定の生成に失敗する。is_desktop_android に直した |
| 管理ページ(Patch 15) | viewport を指定して、元からある狭幅モードを発動させた。680px 以下でカードを 1 カラムにし、ボタン行とトーストを折り返す |

VP9 / AV1 の動画(YouTube の通常の動画)は元から再生できていた。管理ページの変更はどれも 680px 以下に限っていて、PC の幅での表示は変わらない。
