---
title: OmniVerse: App Store への提出を GitHub Actions から自動でやる経路を作った
summary: ビルドから altool でのアップロードまで。署名と認証キーで 3 回つまずいた
projects: [omniverse]
---

iOS 版を App Store に出すため、CI でビルドしてそのままアップロードする経路を足した。これまでの Ad Hoc ビルドは残し、並行して走らせる。この日は 3 か所でつまずいた。

![CI に App Store 行きの経路を足した](/devlog/2026-04-22-omniverse-appstore-ci/upload-lane.svg)

| つまずき | 原因 | 直し方 |
|---|---|---|
| archive が失敗 | flutter build ipa は Development 証明書を求める。CI には Distribution しか無い | xcodebuild を直接呼び、手動署名で archive と export |
| Pod の署名で失敗 | 手動署名だと Pod のターゲットが provisioning profile を受け付けない | Podfile の post_install で Pod の署名を無効化 |
| altool が認証キーを拒否 | 鍵が「有効な認証キーではない」と判定される | 改行を LF に正規化し、形式の診断ログを追加(鍵の中身は出さない)。鍵を登録し直して再試行 |

アプリアイコンは App Store の要件に合わせて RGB で作り直した。

アプリ側では、通知タブを開く前に通知が既読になる不具合を直した。IndexedStack は裏のタブもレイアウトするため、見えていないタイルが既読の処理を走らせていた。通知タブが表示中のときだけ既読にする。
