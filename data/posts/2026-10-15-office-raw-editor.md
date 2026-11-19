---
title: PySide6 に移り、exe で配れるようにする
summary: GUI を PySide6 に移し、絵文字をアイコンに替え、テスト 186 件と exe のビルドを足した
projects: [office-raw-editor]
---

GUI の土台をライセンスの緩い PySide6 に移した。画面の絵文字は単色のベクターアイコンに替え、ファイル種別ごとに色を分けた。消えていたボタンの文字なども直している。core と画面のテストを書き、計 186 件にした。PyInstaller で exe を作って zip で配れるようにし、アプリのアイコンも用意した。
