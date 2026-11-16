---
title: OmniVerse: App Store のビルドが通らない理由を 5 つ潰した
summary: 過去 12 個のビルドが「失敗」で止まっていた。原因は Info.plist の目的文字列の不足
projects: [omniverse]
---

App Store Connect に上げたビルドが、過去 12 個すべて「失敗」で止まっていた。届いたエラーコードを 1 つずつ解消した。

![アップロード後の検査で落ちていた。直した場所は 4 つ](/devlog/2026-04-24-omniverse-appstore-rejections/fix-places.svg)

| エラー | 原因 | 直し方 |
|---|---|---|
| ITMS-90683 | 写真・カメラ・マイクの目的文字列が無い | Info.plist に 4 つ追加 |
| バイナリが無効 | integration_test がリリースビルドに埋め込まれる | dev_dependencies から外し、実行時だけ戻す |
| INVALID_BINARY | アプリ本体の Privacy Manifest が無い | PrivacyInfo.xcprivacy を追加し、使用理由を宣言 |
| ITMS-90725 | iOS 26 SDK でのビルドが必須になる | CI の runner を macos-26 に |
| ITMS-91061 | share_plus に Privacy Manifest が無い | share_plus を更新 |

最後の share_plus は、13.1.0 に上げると file_picker と win32 の依存がぶつかり、pub get が通らなかった。Privacy Manifest を同梱していて依存も両立する 12.0.2 に落ち着いた。
