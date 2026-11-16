---
title: Hayabuzz: P2P 層を自前実装に置き換えた
summary: Trystero をやめて WebRTC を直接扱い、バンドルは 110KB から 60KB に
projects: [hayabuzz]
---

P2P 通信を Trystero に任せていたが、依存を外して自前の実装に置き換えた。WebTorrent トラッカーの WebSocket プロトコルと、RTCPeerConnection / DataChannel の管理を自分で書いた。同じ日に、遊び方のルールもまとめて足している。

![自前の P2P 層: シグナリングから直結まで](/devlog/2026-08-21-hayabuzz-own-p2p-layer/signaling-flow.svg)

| 変更 | 中身 |
|---|---|
| シグナリング | announce に offer / answer を相乗りさせて交換。複数トラッカーに並行でつなぎ、重複したシグナルは捨てる |
| 接続 | peer_id に役割を埋め込み、回答者どうしはつながないスター型を WebRTC の層で強制。双方向 offer で参加を即時化 |
| 時刻同期 | 時計のずれの推定に min-RTT フィルタを足した |
| 旧端末 | ビルドターゲットを safari12 にし、ポリフィルと CSS のフォールバックを追加 |
| ルール | ハンデ、問題の順次表示、チーム戦、得点と勝ち抜けライン、問題セット、○× / 4択の一斉回答、結果発表 |

依存は qrcode だけになり、バンドルは 110KB から 60KB になった。複数端末の E2E は 26 秒から 10 秒に縮んだ。E2E は計 10 件。
