---
title: Office Raw Editor: 中身の文字列でファイルを探せるようにした
summary: ファイルの内容検索を足し、ツリーで主要な XML と大きいファイルを目立たせた
projects: [office-raw-editor]
---

Office Raw Editor は、Word / Excel / PowerPoint のファイルを開いて内部の XML を直接編集する GUI ツール。前日から 2 日で、中身の文字列で探す機能とツリーの見やすさに手を入れた。

![ファイルツリー: 内容検索・件数・サイズの濃淡](/devlog/2026-04-29-office-raw-editor-content-search/content-search.svg)

| 変更 | 中身 |
|---|---|
| ファイル内容検索 | 指定した文字列を含むファイルをスキャンし、ツリー上でハイライトまたはフィルタ表示する。Ctrl+Shift+F で検索欄へ移る |
| ヒット件数 | ファイルごとの件数をサイズ列の右に出し、合計はステータスバーに出す |
| 主要ファイルの強調 | document.xml、workbook.xml、sheet*.xml、presentation.xml、slide*.xml をアイコンと太字で示す |
| サイズのヒートマップ | サイズ列に、最大値を基準にした背景色を付ける。一番大きいファイルが目立つ |

あわせて、エディタ内検索の「前へ」が同じマッチに居座って進まない不具合を直した。検索の起点を選択範囲の先頭に変えている。
