import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

/**
 * Stash Notes のデータ層。
 *
 * テーブルを分離しているのは最小権限のため: 秘密URL経由の「未認証」Lambda(get-memo /
 * save-tab 等)には tokens/memos/tabs/access-logs だけを grant し、users(プラン・
 * 課金枠カウンタ)には一切アクセスさせない。単一テーブルだとこの境界が引けない。
 */
export class NotesStorageStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly memosTable: dynamodb.Table;
  public readonly tabsTable: dynamodb.Table;
  public readonly tokensTable: dynamodb.Table;
  public readonly accessLogsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 利用者(Google 連携 Cognito の sub)。無料枠カウンタを原子的に増減する。
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: 'notes-users',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // メモ本体のメタ。active_token_hash が現在有効な秘密URLのハッシュ。
    this.memosTable = new dynamodb.Table(this, 'MemosTable', {
      tableName: 'notes-memos',
      partitionKey: { name: 'memo_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 管理画面の「自分のメモ一覧」を新しい順に引く
    this.memosTable.addGlobalSecondaryIndex({
      indexName: 'by_owner',
      partitionKey: { name: 'owner_user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
    });

    // タブ(memo_id パーティションに同居 → 1 Query で全タブ取得、削除も BatchWrite で一括)。
    // content は inline なので 1 タブの上限は DynamoDB の 400KB item 制限より十分小さく取る
    // (実効 ~60KB)。かつ MAX_TABS × 上限 ≤ 約1MB に収め、全タブ取得が Query 1ページに収まる
    // ようにする(超えるなら LastEvaluatedKey でページングが必要になる)。
    this.tabsTable = new dynamodb.Table(this, 'TabsTable', {
      tableName: 'notes-tabs',
      partitionKey: { name: 'memo_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'tab_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 秘密URLトークン。PK は SHA-256(raw token) のフル 64 hex。
    //
    // 【設計の要】解決は必ず「この PK への ConsistentRead GetItem」で行う。GSI は結果整合の
    // ため、再発行直後に旧ハッシュが数秒 active に見えてしまい「再発行で旧URLを即失効」を
    // 破る。base テーブルへの強整合読みなら、失効を確定した TransactWrite のコミット直後の
    // 次リクエストで必ず revoked を観測できる。
    //
    // 生トークンは保存しない(発行レスポンスで1度だけ返す)。スロットル状態
    // (last_save_ms / rl_bucket / rl_count / last_view_ms)も同アイテムに置き、
    // 解決とレート制御を1回の条件付き Update で同時に行う。
    this.tokensTable = new dynamodb.Table(this, 'TokensTable', {
      tableName: 'notes-tokens',
      partitionKey: { name: 'token_hash', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    // 失効済みトークンを memo 単位で棚卸しする GSI は現状不要(削除カスケードは
    // memos.active_token_hash から辿れる)。監査要件が出たら by_memo を足す。

    // アクセスログ。「誰がいつ開いたか」をメモ画面と管理画面に出すための記録。
    // ts_ulid は "2026-07-16T05:00:00.000Z#01J..." 形式(新しい順に引くための複合SK)。
    // ここだけ PITR は無効: TTL で自動失効する一時ログにバックアップは無意味なため
    // (RETAIN は誤削除防止で維持)。
    this.accessLogsTable = new dynamodb.Table(this, 'AccessLogsTable', {
      tableName: 'notes-access-logs',
      partitionKey: { name: 'memo_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ts_ulid', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expires_at',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}
