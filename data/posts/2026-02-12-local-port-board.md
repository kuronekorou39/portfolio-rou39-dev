---
title: v2.1.1 を Windows と macOS 向けに出す
summary: 名前を PortBoard にそろえ、Windows と macOS のインストーラーを作って v2.1.1 にした
projects: [local-port-board]
---

配布の準備を進め、v2.1.1 にした。インストーラーのファイル名を PortBoard にそろえ、Windows のインストーラーは日本語にした。macOS のアイコン不足でビルドが落ちていたのを直し、push ごとにインストーラーを作る。2 秒ごとにコマンドプロンプトが一瞬出ていた不具合も、全コマンドに窓を出さない指定を付けて直した。
