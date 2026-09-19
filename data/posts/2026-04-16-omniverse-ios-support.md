---
title: OmniVerse: iOS に対応し、1 日で v1.13.0 から v1.13.6 まで出した
summary: Android 専用の API と UA が iOS で次々に落ちた。1 件ずつ直してリリースを重ねた
projects: [omniverse]
---

Android 専用だった OmniVerse を iOS でも動くようにした。iOS のプロジェクトを作り、パッケージ ID を両 OS で揃え、GitHub Actions を Android / iOS の並列ビルドにした。オーバーレイ表示は Android の機能なので、iOS では隠している。出してみると、Android 前提のコードが順に引っかかった。

| 版 | 不具合 | 直し方 |
|---|---|---|
| v1.13.1 | WebView を開くとクラッシュ | Android 専用の WebStorage 削除を OS で分岐 |
| v1.13.2 | Google ログインのブロックと、X のログインループ | iOS では Safari の UA、Android では Chrome の UA を使う |
| v1.13.3 | 画像を保存できない | 保存先を iOS 用のディレクトリに分岐。UA は共通の定数にまとめた |
| v1.13.4〜 | Google ログインのポップアップ | iOS だけ、同じ WebView に URL を読み込む方式にした |
