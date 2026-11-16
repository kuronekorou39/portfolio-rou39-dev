---
title: Domain Traffic Inspector: README を短くし、依存の脆弱性に対応した
summary: 詳細な使い方を docs へ分離。nanoid の脆弱性対応と開発依存の更新
projects: [domain-traffic-inspector]
---

README に使い方の詳細まで入っていて長かった。あわせて依存関係の保守をした。

![README を 2 つに分け、ZIP にも同梱する](/devlog/2026-08-17-domain-traffic-inspector-readme-split/readme-split.svg)

| 変更 | 中身 |
|---|---|
| README | 簡潔にし、詳細な使い方を docs/USAGE.md へ分離した |
| インストール手順 | ZIP から入れる手順を README に追加 |
| 脆弱性 | nanoid の脆弱性に対応して lockfile を更新 |
| 開発依存 | Dependabot の PR 4 件(jsdom 30、eslint 10.8.1 など)の内容を一括で適用 |

リリースの ZIP にも docs/ を同梱するよう、workflow を更新した。ZIP だけを受け取った人も、分離した使い方を読める。依存の更新後は、lint とテスト 77 件の通過を確認した。
