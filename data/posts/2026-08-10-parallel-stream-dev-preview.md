---
title: Parallel Stream: 公開前の UI を確かめる確認用ページを /dev/ に置いた
summary: release の中に dev/ を作り、作業中の UI を写す。公開の手順もスクリプトに
projects: [parallel-stream]
---

公開を release ブランチに切り出したので、作業中の UI を確かめる場所が無くなった。拡張ページで開く案は成立しなかった。埋め込みの許可が公開サイトのオリジン発の読み込みにしか効かず、枠が 1 つも出ないため。release の中に dev/ を作り、作業中の UI をそこへ写す仕組みを 2 日かけて固めた。

![release の中に、確認用の /dev/ を置く](/devlog/2026-08-10-parallel-stream-dev-preview/dev-dir.svg)

| つまずき | 直し方 |
|---|---|
| 中身が同じでも「変更あり」に見え、空コミットで失敗 | 改行コードの正規化が原因。作業ツリーではなく索引で比較する |
| ローカルの release が古くなり push が弾かれる | ローカル参照を持たず、origin/release を取り出してその上に積む |
| /dev/ からの ZIP リンクが 404 | 確認用ページに合う main の ZIP を一緒に置く |
| 公開の push が枝分かれで弾かれる | release を取り出して中身を main に置き換え、dev/ だけ残す |

release のコミットメッセージには版を入れ、履歴だけで何を配ったか分かるようにした。
