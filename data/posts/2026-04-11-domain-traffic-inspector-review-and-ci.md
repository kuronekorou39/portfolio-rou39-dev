---
title: Domain Traffic Inspector: レビュー指摘をまとめて直し、テストと CI を入れた
summary: 広告判定の誤検知など 4 件の不具合を修正。vitest 25 件と GitHub Actions
projects: [domain-traffic-inspector]
---

コードレビューで挙がった指摘を一括で直し、その後にテストと CI を足した。

![広告判定: キーワード「ad」の照合のしかた](/devlog/2026-04-11-domain-traffic-inspector-review-and-ci/ad-match.svg)

| 不具合 | 直し方 |
|---|---|
| 広告判定の誤検知 | ドメインをパーツ単位で照合する |
| ブロック解除でメタデータが消える | 解除時の消失を防ぐ |
| ccTLD のサードパーティ判定が誤る | 判定を修正 |
| ブロック ON の復元がずれる | domainRules を元に復元する |

性能面では、ブロック対象ドメインの取得をキャッシュし、件数の更新を 500ms に間引いた。トラフィックタブにはブロック済みのドメインも出し、厳格モードの切替には確認ダイアログを挟む。テストは vitest で 25 件。共有ロジックを domain-utils.js に抽出して対象にした。GitHub Actions が push / PR のたびに lint とテストを走らせ、リリースはテスト通過後にビルドする。
