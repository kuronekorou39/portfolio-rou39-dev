---
title: Parallel Stream: コメントを映像の上に流す弾幕機能を足した
summary: 各枠のライブチャットを取得し、映像の上を右から左へ流す
projects: [parallel-stream]
---

複数の配信を並べると、チャット欄まで並べる場所が無い。コメントを各枠の映像の上に右から左へ流す弾幕機能を作った。対象は Twitch / YouTube / OPENREC のライブチャット。

![チャットのコメントが映像の上を流れるまで](/devlog/2026-06-14-parallel-stream-danmaku/danmaku-flow.svg)

| 部分 | 中身 |
|---|---|
| 取得 | 枠の中の content script がチャットの DOM を監視し、親へ postMessage。親は送り主から枠を特定する |
| YouTube | チャットが入れ子の iframe にある。ON の指示を下へ、コメントを上へ中継し、origin を検証する |
| 描画 | DOM と Web Animations API。レーンを自動で割り当てて重なりを避け、流量を制限する |
| 絵文字 | テキストと画像の区切りで送り、親が img で描く。https 限定で、枚数と長さに上限 |
| 設定 | サイズ・速度・不透明度・色など。全体の既定と枠ごとの上書きを切り替える |

前段として同じ日に、ダイアログを移動可能にし、メニューの開閉を整えるなど、枠まわりの UI を直した。
