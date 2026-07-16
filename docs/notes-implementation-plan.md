# Stash Notes 実装プラン

3個目のサブドメイン `notes.rou39.com`(秘密URLメモサービス)を、既存モノレポ内に uraneko と同型でクリーンに切り分けて実装するためのプラン。5エージェント設計WF + 敵対的レビューの成果を、矛盾を解消して統合したもの。

- 前提と評価: `~/.claude/.../memory/stash-notes-plan.md`
- コア体験: **「管理=Googleログイン必須 / 利用=秘密URLでログイン不要」**

---

## 0. 結論とスコープ

- **実現可能**。uraneko の軽い兄弟(決済系を全部落とした形)で、大半が実証済みスタックの複製。
- **確定した設計判断(ユーザー)**: ①管理は Google 連携のみ ②無料アカウント無制限作成は許容 ③運営者が平文を読める件は非対処(URLのみ認可=利便性優先、ページのアクセスログで許容)④重複は再利用可能な construct へ括り出す(本番の uraneko/base は触らない)。
- MVP優先順位(仕様§16): admin ログイン → メモURL発行 → 秘密URLアクセス → メモ画面 → 複数タブ → 自動保存 → 再発行/失効。以降: レート制限・監視・PWA準備。後続: 添付(S3)・PIN・アクセスログUI・有料。

---

## 1. アーキテクチャ全体像

`base portfolio` / `uraneko` と並ぶ**独立した垂直スライス**。ステートフルリソースは一切共有せず、跨ぐのは AWS アカウント/リージョン・共有ワイルドカード証明書 `*.rou39.com`・ホストゾーン・`pre-signup.ts`(base流用)のみ。

**決定1(Googleのみ)による簡素化 —— uraneko より軽い:**
- `email-stack`(SES DKIM/SPF/DMARC/MAIL-FROM)を**丸ごと削除**(Cognitoが検証メールを出さない)。
- Cognito 認証ドメインは**カスタム `notes-auth.rou39.com`**(2026-07-17 ユーザー決定。当初のデフォルトドメイン案から変更)。理由: ブランド確認未通過のアプリは Google ログイン画面に「リダイレクトURIの eTLD+1」が表示されるため、デフォルトドメインだと `amazoncognito.com` と出て第三者の利用者に不信感を与える。カスタムなら `rou39.com` 表示。公開サービスとして運用するのでこちらを採る。
- 認証ドメインは **1階層必須**(`auth.notes.rou39.com` は `*.rou39.com` 非対象)。uraneko の `uraneko-auth.rou39.com` と同じ実証済みパターン: us-east-1 共有証明書 + Route53 Aレコード + `crossRegionReferences:true`、初回プロビジョニング ~15-20分。

### スタック構成(uraneko からの派生)

| スタック | 派生元 | 内容 / 差分 |
|---|---|---|
| **NotesStorage** | uraneko/storage-stack | 5テーブル(users/memos/tabs/tokens/access-logs)。決済テーブルは無し |
| **NotesSecrets** | uraneko/secrets-stack | `notes/google-oauth-client-secret` + `notes/ip-hash-salt`。nowpayments/order-access は削除 |
| **NotesAuth** | uraneko/auth-stack | Google IdP + app client、**カスタム認証ドメイン `notes-auth.rou39.com`**(共有証明書 + Aレコード)。SES email config と `addDependency(email)` を削除、`pre-signup.ts`(base)流用。`supportedIdentityProviders=[GOOGLE]` |
| ~~NotesEmail~~ | — | **削除**(決定1) |
| ~~NotesIngestIam~~ | — | **削除**(非commerce) |
| **NotesApi** | uraneko/api-stack | RestApi。`/admin/*`=Cognitoオーソライザー、`/m/*`=オーソライザー無し(body内トークン検証)。handler毎 NodejsFunction、予約同時実行、最小権限grant |
| **NotesWaf** | uraneko/waf-stack | CLOUDFRONT WebACL(us-east-1)。一般レート + `/api/m`・`/api/admin` レート(**defense-in-depth。本命はアプリ層**) |
| **NotesFrontend** | uraneko/frontend-stack | S3+OAC+CloudFront、prefix-strip + SPA-rewrite の CF Function、admin 用 Authorization 転送キャッシュポリシー、CSP(システムフォント/connect-src self+cognito)、共有 `*.rou39.com` 証明書再利用、**新しいグローバル一意なサイトバケット名** |
| **NotesMonitoring** | uraneko/monitoring + base/monitoring | Budgets コストアラーム + SNS Lambda エラー/スロットルアラーム + 濫用トリップワイヤ |

### DRY: `SubdomainSpa` construct(決定4)

- **方針**: Notes の共通インフラ(Google-Cognito プール+IdP+client / API Gateway+authorizer+NodejsFunction配線ヘルパ / WAFv2 CLOUDFRONT / CloudFront+S3+OAC frontend(prefix-strip・SPA-rewrite・CSP・Authorization転送)/ monitoring SNS+alarms)を **L3 construct `SubdomainSpa` として最初から実装**する。Notes が最初の利用者。
- **本番の uraneko/base はこの construct に retrofit しない**(理由: 稼働中の決済システムに対する CFN 論理ID/エクスポートの churn。DRY のためだけに本番を危険に晒さない)。uraneko の移行は必要なら**後日の独立タスク**。
- **per-subdomain に残す**(construct の props/子クラスで注入): テーブル集合、ルート/ハンドラ定義、CSP `connect-src`、レート閾値、予約同時実行数。
- props 概形:
  ```ts
  interface SubdomainSpaProps {
    subdomain: string;              // 'notes.rou39.com'
    hostedZone: route53.IHostedZone;
    certificate: acm.ICertificate;  // 共有 *.rou39.com(frontend用のみ)
    googleClientId: string;         // 直書き(公開値)
    googleClientSecret: secretsmanager.ISecret;
    siteBucketName: string;         // グローバル一意
    cspConnectSrc: string[];        // ['self', cognito idp, https://notes-auth.rou39.com]
    wafRateRules: RateRule[];
    // API ルート/ハンドラ・テーブルは子クラスまたは addRoutes() で注入
  }
  ```
- 代替(fallback): `infra/lib/uraneko` を `infra/lib/notes` にクローンして strip。速いが重複は残る。**「きれいに」の意向 + 新規実装なので construct を推奨**(限界費用が低い)。

### app.ts 配線(追記のみ、既存スタックは不変)

```
const NOTES_SUBDOMAIN = `notes.${DOMAIN_NAME}`;
const notesHostedZone = route53.HostedZone.fromHostedZoneAttributes(app, 'NotesHostedZone', {...});
const notesStorage = new NotesStorageStack(app, 'NotesStorage', { env });
const notesSecrets = new NotesSecretsStack(app, 'NotesSecrets', { env });
const NOTES_AUTH_DOMAIN = `notes-auth.${DOMAIN_NAME}`; // 1階層必須(*.rou39.com の対象内)
const notesAuth   = new NotesAuthStack(app, 'NotesAuth', { env, crossRegionReferences: true, certificate, hostedZone: notesHostedZone, authDomain: NOTES_AUTH_DOMAIN, subdomain: NOTES_SUBDOMAIN, googleClientSecret: notesSecrets.googleOAuthClientSecret });
const notesApi    = new NotesApiStack(app, 'NotesApi', { env, ...notesStorage.tables, userPool: notesAuth.userPool, userPoolClientId: notesAuth.userPoolClient.userPoolClientId });
const notesWaf    = new NotesWafStack(app, 'NotesWaf', { env: { account, region: 'us-east-1' }, crossRegionReferences: true });
new NotesFrontendStack(app, 'NotesFrontend', { env, crossRegionReferences: true, api: notesApi.api, certificate, hostedZone: notesHostedZone, subdomain: NOTES_SUBDOMAIN, webAclArn: notesWaf.webAclArn });
new NotesMonitoringStack(app, 'NotesMonitoring', { env, alertEmail: process.env.ALERT_EMAIL || 'kuronekorou39@gmail.com', ... });
```
- `cdk deploy --all` は app.ts で instantiate した瞬間に自動で拾う(コマンド変更不要)。

### 触る共有ファイルは3つだけ

1. **root `package.json`**: workspaces に `frontend-notes` 追加 + `dev:notes`/`build:notes`。**依存は frontend-uraneko の既存解決版に pin**(react 19.2.4 / vite 8.0.x 等)し lockfile ドリフト回避 → `npm install` → lockfile コミット。
2. **`.github/workflows/deploy.yml`**: uraneko build の後に `Build frontend-notes`(`npm run build:notes`)ステップ追加。seed/OIDC 変更なし。
3. **`infra/bin/app.ts`**: 上記ブロック追記(既存スタックのリネーム/並替は厳禁)。

変更不要: `infra/cdk.json`・`infra/tsconfig.json`・`infra/package.json`・`backend/tsconfig.json`・`shared/`。`github-oidc-stack.ts` は Notes に CI seed が無いので不要。

### デプロイ前チェックリスト(手動・順序厳守)

1. **新規GCPプロジェクト** + OAuth 同意画面 + OAuth クライアント作成(プール分離ポリシー)。client ID 控える。
2. Google の承認済みリダイレクトURIに **`https://notes-auth.rou39.com/oauth2/idpresponse`** を登録(uraneko の Google クライアントは流用しない=新規クライアントに登録。redirect_uri 不一致だとログインが失敗する)。
3. `notes/google-oauth-client-secret` を **初回デプロイ前に** Secrets Manager 投入(でないと PLACEHOLDER が焼き込まれる)。
4. `cdk deploy` → CfnOutput(pool id / client id / cognito domain)取得。
5. それらを `frontend-notes/src/lib/auth.ts` に直書き。
6. `npm run build:notes` → `cdk deploy NotesFrontend`。
- Cognito app client: callbackURLs = `http://localhost:5175/auth/callback` + `https://notes.rou39.com/auth/callback`、logoutURLs 同様。

---

## 2. ディレクトリ構成

```
infra/lib/notes/           storage / secrets / auth / api / waf / frontend / monitoring stack + subdomain-spa.ts(construct)
backend/src/handlers/notes/ admin-*.ts / get-memo.ts / save-tab.ts / create-tab.ts / delete-tab.ts / flush.ts / log-access.ts
backend/src/lib/notes/      tokens.ts / tabs.ts / memos.ts / quota.ts / access-log.ts / types.ts / http.ts
frontend-notes/            別Viteワークスペース(devポート5175)
```
`backend/src/lib/response.ts` に `payloadTooLarge(413)` / `tooManyRequests(429)` / `noStore()` を追加(uraneko も使う共有だが**追記のみ・既存不変**)。

---

## 3. データモデル(5テーブル・分離採用)

repo 慣習(PAY_PER_REQUEST + PITR + RETAIN、単機能GSI)。**単一テーブルではなく5分離**を採用 —— 未認証Lambdaに `notes-users` を一切 grant しない最小権限境界を守るため(critique の build-blocker を分離側で解決)。

| テーブル | PK / SK | GSI | 主な属性 |
|---|---|---|---|
| **notes-users** | PK `user_id`(Cognito sub) | — | email, plan, url_count, memo_count, byte_size(soft), created_at |
| **notes-memos** | PK `memo_id` | `by_owner`(PK owner_user_id, SK created_at) | owner_user_id, title, active_token_hash, tab_count, status, created/updated_at |
| **notes-tabs** | PK `memo_id`, SK `tab_id` | — | title, content(inline≤~60KB), version, position, byte_size, updated_at |
| **notes-tokens** | PK `token_hash`(SHA-256 フル64hex) | (任意 `by_memo` 監査用) | memo_id, owner_user_id, status(active/revoked), last_save_ms, save_count, rl_bucket, rl_count, last_view_ms |
| **notes-access-logs** | PK `memo_id`, SK `${ts}#${ulid}` | — | token_hash, ip_hash, ua(切詰), event(view/save), ts, expires_at(TTL~90日) |

- access-logs のみ **PITR=false + native TTL**(自動失効ログに PITR は無意味。RETAIN は維持)。
- content は inline なので **TAB_CAP を 400KB 未満**(実効 ~60KB。sendBeacon/fetch keepalive の 64KB とタブ上限の衝突回避のため封筒分の余裕を取る)。
- **`MAX_TABS × TAB_CAP ≤ ~1MB`**(例 12タブ×60KB=720KB)にして、メモロードの `Query PK=memo_id` が1ページに収まるようにする。超えるなら LastEvaluatedKey ページング。
- 全アクセスパターンがキー or 単一GSIで充足(ユーザー面のScanゼロ)。

---

## 4. トークン・ライフサイクル(強整合・失効即時)

**`backend/src/lib/notes/tokens.ts`**。`order-token.ts` は流用しない(ステートレスHMAC=失効不可、128bit切詰)。

- **発行(admin認証)**: `raw = randomBytes(32) → base64url`(256bit)。URLフラグメントに raw。DBは `SHA-256(raw)` フル64hex。1回の `TransactWrite`: memos Put(Cond attribute_not_exists) + tokens Put(Cond attribute_not_exists、稀な衝突は再生成) + users `ADD url_count :one`(Cond `url_count < :cap`)。**raw は発行レスポンスの1回だけ**サーバ外に出る。URL = `https://notes.rou39.com/m/#<raw>`。
- **アクセス解決**: `GetItem(token_hash, ConsistentRead:true)`。無し or `status!=active` → **一律404**(未知/失効/削除で同一レスポンス=オラクル化しない)。
- **再発行**: `TransactWrite`: 新tokens Put(active) + 旧tokens Update `status=revoked`(Cond `#s=:active`) + memos Update `active_token_hash=new`(Cond `active_token_hash=:old AND owner=:me`)。**証明**: commit 直後、旧hashの `status=revoked` は base テーブルに durable → 次の `GetItem(旧hash, ConsistentRead)` は強整合で必ず revoked を観測 → 404。**GSI不使用 + 強整合読み**の2不変条件が肝。
- **失効/削除**: 失効=tokens Update `revoked`。削除(cascade)=**先にトークンを revoke** → tabs を `Query PK` → `BatchWrite` 削除 → memos soft-delete → users カウンタ best-effort 減算。冪等/リトライ可。
- **HMAC secret 不要**: 256bit 一様乱数はソルト/ペッパー不要(前像抵抗が完全)。→ uraneko の `order-access-secret` 依存を削減。

---

## 5. API サーフェス & 認可

**ADMIN(Cognito authorizer + `claims.sub`。Lambda内JWT検証は不要=critique の統一判断):**
- `GET /admin/memos`(一覧、GSI by_owner)
- `POST /admin/memos`(発行、1回限りの秘密URL返却)
- `POST /admin/memos/{id}/reissue` / `POST /admin/memos/{id}/revoke`
- `PATCH /admin/memos/{id}`(改名) / `DELETE /admin/memos/{id}`(cascade)
- `POST /admin/killswitch`(全体緊急停止)/ `GET /admin/memos/{id}/access-log`
- 全ルート `owner_sub` にスコープ(自分のメモのみ)。**NotesFrontend は Authorization を転送するキャッシュポリシー必須**(`frontend-stack.ts:106-114` 流用。CACHING_DISABLED コピーだと admin GET が 401 になる)。

**MEMO(オーソライザー無し・トークンはPOST body):** 全て POST(秘密をpath/query/Refererに載せない)
- `POST /m/get`(メモ+タブ取得、`Cache-Control:no-store`)
- `POST /m/tabs/save` `{token, tab_id, base_version, content, title?}`
- `POST /m/tabs/create` / `POST /m/tabs/delete`
- **`POST /m/flush`**(全dirtyタブを1回で保存 —— 多タブ pagehide flush 対策、下記)
- `POST /m/log-access`(アクセスログ表示用)

---

## 6. 未認証書き込みの防御(app-layer が本命)

WAF/IP はorigin直叩きでバイパス可能 & body内トークンを見られないので **defense-in-depth 扱い**。実制御はアプリ層:

- **per-token スロットル**: `notes-tokens` への1回の条件付きUpdateで解決+スロットルを兼ねる。`Cond '#s=:active AND (attribute_not_exists(last_save_ms) OR last_save_ms <= :now-:minInterval)' SET last_save_ms=:now ADD save_count :one`。失敗時 GetItem で 404(未知/失効)/429(頻度超過)を判別。N/分の固定窓(`rl_bucket`/`rl_count`)も同アイテムに重畳。
- **多タブ flush のデータ喪失を解決** → **`POST /m/flush`**(全dirtyタブ=**1回のスロットル消費 + 1書込**)。sendBeacon 複数発射で2つ目が429で消える問題を根本解消。
- **サーバ側クォータ**(413/409): タブ毎バイト上限(in-Lambda 事前チェック)、タブ数/メモ(create-tab で `tab_count < :max` 原子的)、メモ数/ユーザー(発行時 `memo_count < :max`)。`coupon.ts:42-76` 流用。
- **予約同時実行**: memo Lambda は必ず reserved(save/create/get ~15-20、delete/log ~10、admin ~5)。**未予約枠 ≥100 かつ uraneko webhook/fulfill の未予約枠を侵さないこと**を合計確認(逆に予約は uraneko を濫用スパイクから守る)。
- **課金アラーム**(Budgets)+ memos ItemCount/テーブルサイズのアラーム。無制限アカウント作成(決定2)への唯一のハード backstop は**全体キルスイッチ**(module cache ~60s ラグ有り)。
- **ログに raw トークン/body を絶対に出さない**(memo_id か token_hash 先頭のみ)。

---

## 7. 自動保存エンジン(`frontend-notes/src/lib/autosave.ts`)

- **タブ毎 version の楽観ロック**: クライアントは `base_version` 送信 → サーバ `Cond version=:base SET content, version+1`。不一致は **409 + サーバ現状返却**(サイレント上書きしない)。stale な debounce 保存もこの条件で弾かれる。
- debounce ~1s。タブ毎 localStorage dirty バッファ(**200+新versionのACKまで保持**、失敗は指数バックオフでリトライ)。
- **退出flush**: `visibilitychange('hidden')`/`pagehide` で `POST /m/flush`。トランスポートは **`fetch(url,{keepalive:true})`**(sendBeacon の64KB問題回避 + Promise取得可)。
- **sendBeacon/keepalive は応答を読めない** → 次回 `/m/get` 時に version を突合して reconcile(未clearバッファを再送 or サーバ版採用)。
- **409 は明示的に reconcile**(ConflictBanner: 「サーバー版を読込」or「こちらで上書き」、ローカルテキストは復旧バッファに退避)。keystroke を黙って失わない。

---

## 8. フロントエンド(`frontend-notes/`、frontend-uraneko の準クローン)

Vite + React 19 + react-router 7、devポート5175。**2つの隔離されたルートツリー**:

- **ADMIN SPA**: Google-only ログイン(uraneko の PKCE+state OAuth `auth.ts:156-267` 流用、email/pass 関数は削除、COGNITO_DOMAIN を `https://notes-auth.rou39.com` に、キーを `notes_*` に)。`AuthContext`/`AuthCallbackPage` は verbatim(二重code交換ガード込み)。DashboardPage は MyOrdersPage のマストヘッド+レスポンシブ表を流用(memo一覧/状態/日時/発行・再発行・失効・削除)。**秘密URLは発行/再発行時に1回だけ**モーダル表示(サーバはハッシュのみ保持=再表示不可、要注意書き)。
- **MEMO 画面(`/m`)**: **AuthProvider の外**に隔離(Cognito SDK/Google Fonts/全外部依存を memo チャンクから排除)。`App.tsx` 先頭で `pathname.startsWith('/m')` を分岐し **admin ツリーも lazy 化**(critique: 静的 import で Cognito が entry チャンクに漏れると XSS でフラグメントトークン窃取面が広がる)。token は `location.hash` から読み POST body のみで送信。複数タブ(title+body、作成/切替/編集)、上記自動保存、保存状態表示、アクセスログ表示。**contentはtextContent/textarea描画(HTML化しない)**、外部依存ゼロ、システムフォント。
- **CSP**(NotesFrontend、フロントの要求): `connect-src 'self' https://notes-auth.rou39.com https://cognito-idp.ap-northeast-1.amazonaws.com; font-src 'self'`(uraneko のフォントホスト許可はコピーしない)。`/m` は `script-src 'self'`。`index.html` に `<meta name="referrer" content="no-referrer">` + robots noindex。
- **PWA-ready 構造**(SW は MVP 後回し): 将来 SW scope は `/m/` 限定、メモ内容は IndexedDB にトークン別、**SW HTTPキャッシュにメモ応答を絶対載せない**(URL同一で秘密URL間混線)。MVP のオフライン網は localStorage dirty バッファのみ。

---

## 9. アクセスログ(決定3の mitigation)

- view/save 時に `notes-access-logs` へ append: `{memo_id, sk=ts#ulid, token_hash(rawは絶対保存しない), ip_hash, ua切詰, event, expires_at(TTL)}`。
- **`ip_hash = HMAC-SHA256(ip, 日次ローテートsalt)`**(素のSHA-256はIPv4の2^32空間を総当たり可能。salt は日付由来 or Secrets ローテートで実際に回す)。IPは X-Forwarded-For 先頭(CloudFront が `ALL_VIEWER_EXCEPT_HOST_HEADER` で転送、`frontend-stack.ts:134`)。
- **view ログの書込アンプ対策**: ロード経路のログは**トークン単位で coalesce**(`last_view_ms` 条件付きで N分1回)。未スロットルGETで無制限書込しない。
- メモ画面 & admin 双方に「誰がいつアクセスしたか」を表示 = 運営者可読トレードオフの受容手段。

---

## 10. コスト

増分 ≈ **月$10〜15**(WAFv2 支配的: WebACL $5 + ルール $1×n + $0.60/M req)。Secrets $0.40/個×~2。**Google連携の Cognito は MAU 無料枠でほぼ$0**。CloudFront/DDBオンデマンド/SES(送信なし)は低トラフィックで無視可。

---

## 11. MVP ビルド順(フェーズ)

決定的にビルドできる順序。各フェーズ末で verify。

- **P0 インフラ土台**: `SubdomainSpa` construct + NotesStorage(5表)+ NotesSecrets を app.ts に配線し `cdk deploy`(RETAINで非破壊)。GCP/cognitoドメイン/シークレットのチェックリスト実施。
- **P1 認証**: NotesAuth(Google IdP・カスタムドメイン `notes-auth.rou39.com`)+ NotesApi 骨組み + NotesFrontend。frontend-notes を scaffold(P0チェックリストのID直書き)。Google ログイン往復を実機確認。
- **P2 発行 + 秘密URLアクセス(コア)**: tokens.ts / issue-memo / get-memo(強整合解決・一律404・no-store)。admin DashboardPage で発行→秘密URLをモーダル表示→`/m/#token` で開けることを確認。
- **P3 複数タブ + 自動保存**: tabs.ts / save-tab(version楽観ロック409 + throttle429 + byte413)/ create-tab / MemoScreen + autosave.ts。stale保存409・過大413・連打429・タブ切替/pagehideのflush(`/m/flush`)を検証。
- **P4 再発行/失効/削除**: reissue/revoke/delete cascade。**「再発行で旧URLが次の強整合読みで即404、新URLは200」**を実地検証。
- **P5 濫用対策 + 監視**: NotesWaf、予約同時実行、NotesMonitoring(Budgets + アラーム + キルスイッチ)。
- **P6 アクセスログ**: access-log.ts(HMAC ip_hash・TTL・coalesce)+ メモ画面/admin 表示。
- **P7 PWA準備/仕上げ**: SW-ready 構造・空 manifest(SW未登録)・CSP/no-referrer 最終確認・`/m` チャンクに cognito/auth/font が無いことを grep で検証。

---

## 12. 確定判断の要約(critique 反映)

| 論点 | 確定 |
|---|---|
| データモデル | **5テーブル分離**(未認証Lambdaに notes-users をgrantしない最小権限のため) |
| admin認証 | **API Gateway Cognito authorizer + claims.sub**(member-auth コピー廃止)。Frontend は Authorization 転送必須 |
| 多タブ flush のデータ喪失 | **`POST /m/flush` バッチ**(1スロットル+1書込) |
| view ログ書込アンプ | ロード経路のログは**トークン単位 coalesce** |
| sendBeacon 64KB × タブ上限 | 退出flushは **`fetch(keepalive)`** + TAB_CAP に封筒余裕(~60KB) |
| per-memo kill | **`status=revoked` に一本化**(save条件 `#s=:active` が即ブロック) |
| get-memo 1MBページ | `MAX_TABS × TAB_CAP ≤ ~1MB` に制約(超過ならページング) |
| 予約同時実行 | 合計を確認し未予約≥100 & uraneko webhook 枠を確保。memo Lambda は必ず予約 |
| DRY | `SubdomainSpa` construct を Notes 用に新設。**本番 uraneko/base は retrofit しない** |
| 削除順 | **トークンを先に revoke** → タブ削除(半削除の生URLを防ぐ) |
| ip_hash | 日次ローテート salt の HMAC(実際に回す) |

**ロック(変更しない中核)**: フルSHA-256トークン + 強整合解決 + 条件付きTransactWrite再発行/失効 / タブ毎version 409 / coupon.ts原子カウンタ / 一律404 / フラグメント+no-store+no-referrer+textContent+外部依存ゼロ / 本番非retrofit + 共有証明書再利用 + カスタム認証ドメイン `notes-auth.rou39.com`(2026-07-17 確定)。
