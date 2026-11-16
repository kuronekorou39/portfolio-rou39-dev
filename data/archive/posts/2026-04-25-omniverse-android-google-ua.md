---
title: OmniVerse: iPad の修正で壊れた Android の Google ログインを直した
summary: ポップアップの設定を消した副作用で UA が戻り、Google に 403 で弾かれていた
projects: [omniverse]
---

2 日前の iPad のクラッシュ対策で、Google ログインのポップアップ側の WebView から初期設定を丸ごと消した。その副作用が Android に出た。

![Android: ポップアップの WebView が名乗る User-Agent](/devlog/2026-04-25-omniverse-android-google-ua/popup-ua.svg)

| OS | ポップアップの設定を消した結果 | 対応 |
|---|---|---|
| iOS | もともと無視される仕様なので変化なし | 設定なしのまま(クラッシュを再発させない) |
| Android | 親の User-Agent を継がず、埋め込み WebView の UA に戻る。Google が disallowed_useragent(403)で弾く | Android のときだけ設定を渡す |

CI も 2 か所直した。iOS は App Store の審査中なので、iOS のビルドジョブを一時的に止めた。また、成果物のダウンロード先が想定とずれて、リリースに APK と AAB が添付されない回があった(v1.13.52)。ダウンロードの名前とパスを明示して固定した。
