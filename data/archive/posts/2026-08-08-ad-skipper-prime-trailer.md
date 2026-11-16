---
title: 広告スキッパー: Prime Video 版で、予告編に倍速がかかっていた
summary: 「たまにしかスキップされない」の正体。対象の video の選び方を直した
projects: [ad-skipper-prime, ad-skipper-twitch, ad-skipper-youtube]
---

Prime Video 版で、広告が「たまにしかスキップされない」症状があった。

![倍速をかける video の選び方](/devlog/2026-08-08-ad-skipper-prime-trailer/video-pick.svg)

| 不具合 | 原因 | 直し方 |
|---|---|---|
| 広告がたまにしか送られない | 作品ページには予告編の video が同居し、DOM 順で先に現れる。倍速とミュートが予告編にかかっていた | 広告タイマーの要素から祖先を辿り、同じプレイヤー内の video を選ぶ |
| 広告の後に予告編の音が鳴り出す | 復元のときに全 video の音量を書き換えていた | 広告中に触った video だけを戻す |
| service worker に未処理のエラーが残る | タブを閉じた直後のバッジ更新が失敗し、その Promise を捨てていた | 消えたタブによる失敗は握りつぶす |

予告編が止まっているときだけ偶然本編を掴めていたのが、「たまに」の正体だった。バッジ更新は 3 つの拡張に重複していたので、shared に集約した。
