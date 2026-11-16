---
title: 広告スキッパー: 配布に向けて権限を最小にし、GitHub Releases で配り始めた
summary: 開発用の仕組みを配布ビルドから外し、対象 URL を絞り、名前を変えて公開した
projects: [ad-skipper-twitch, ad-skipper-prime, ad-skipper-youtube]
---

配布に向けて、配布物が要求する権限と、拡張が動く範囲を見直した。

![Twitch 版: 開発用の仕組みを配布ビルドから外した](/devlog/2026-08-05-ad-skipper-release-prep/build-split.svg)

| 変更 | 中身 |
|---|---|
| Twitch 版の権限 | 開発用の DevTools パネルと通信ロガーを開発ビルド限定に。配布ビルドの権限は storage と twitch.tv だけ |
| Prime Video 版の対象 | ドメイン全体から、視聴に関係する URL だけに。商品ページでは video 要素が現れてから動き出す |
| ポイント自動取得 | 規約が禁じる自動操作に当たる可能性があるため、既定を OFF に |
| 名前 | 「広告スキッパー for ●●」に変更。他社の商標を先頭に置くと提携を示唆しかねないため |
| 配布 | ZIP を作るスクリプトを足し、開発ビルドが混ざっていれば中断する。GitHub Releases で 3 つを公開 |

Android で ZIP を展開できないという報告があった。Compress-Archive がパス区切りに \ を書いていたためで、bsdtar に替え、生成後にエントリ名を検査するようにした。README は利用者向けと開発者向けに分けた。
