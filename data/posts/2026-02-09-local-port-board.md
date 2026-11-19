---
title: Docker と K8s を見分ける
summary: Docker・K8s・Cloudflare Tunnel を検出し、Git のプロジェクト名や履歴、ライトテーマを足した
projects: [local-port-board]
---

ポートの持ち主をもっと分かりやすくした。Docker のコンテナ名やイメージ、K8s の port-forward、Cloudflare Tunnel を見分けて表示し、コンテナは一覧から停止・再起動できる。プロセスの作業フォルダから Git のプロジェクト名も出す。終了は確認を挟み、まず正常終了を頼むようにした。ポートの履歴、設定の保存、ライトテーマも足した。
