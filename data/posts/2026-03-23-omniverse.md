---
title: CI を整え、RT が消える不具合を直す
summary: GitHub Actions でビルドと署名を自動化し、取得後に RT が消える問題を直した。v1.3.0
projects: [omniverse]
---

GitHub Actions でビルドを自動化し、署名用の鍵は Secrets から復元するようにした。これを試しながら v1.3.0 まで上げた。
また、取得のたびにリツイートやリポストが消える不具合を、ログで原因を追って直した。
