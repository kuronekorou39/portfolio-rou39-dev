import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import * as path from 'path';

interface NotesApiStackProps extends cdk.StackProps {
  usersTable: dynamodb.ITable;
  memosTable: dynamodb.ITable;
  tabsTable: dynamodb.ITable;
  tokensTable: dynamodb.ITable;
  userPool: cognito.IUserPool;
  siteUrl: string; // https://notes.rou39.com
}

/**
 * Stash Notes の API。認可モデルは2系統:
 * - /admin/* : API Gateway の Cognito オーソライザー必須(管理画面。claims.sub で所有者スコープ)
 * - /m/*     : オーソライザー無し。POST body の秘密URLトークンを Lambda 側で強整合解決
 *
 * 未認証の /m/* が濫用の主面なので、WAF(IP)ではなくアプリ層で防御する:
 * per-token スロットル・サーバ側クォータ(lib/notes)+ ここでの予約同時実行上限。
 */
export class NotesApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  // 監視スタックからアラームを張れるよう公開
  public readonly issueMemoFn: lambda.Function;
  public readonly getMemoFn: lambda.Function;
  public readonly saveTabFn: lambda.Function;
  public readonly flushFn: lambda.Function;

  constructor(scope: Construct, id: string, props: NotesApiStackProps) {
    super(scope, id, props);

    this.api = new apigateway.RestApi(this, 'NotesApi', {
      restApiName: 'notes-api',
      defaultCorsPreflightOptions: {
        allowOrigins: [props.siteUrl],
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    const commonEnv = {
      USERS_TABLE: props.usersTable.tableName,
      MEMOS_TABLE: props.memosTable.tableName,
      TABS_TABLE: props.tabsTable.tableName,
      TOKENS_TABLE: props.tokensTable.tableName,
      NOTES_SITE_URL: props.siteUrl,
    };

    const bundling = { externalModules: ['@aws-sdk/*'] };
    const runtime = lambda.Runtime.NODEJS_20_X;
    const handlerDir = path.join(__dirname, '../../../backend/src/handlers/notes');

    // --- issue memo (管理: メモURL 発行) ---
    const issueMemoFn = new nodejs.NodejsFunction(this, 'IssueMemoFn', {
      runtime,
      entry: path.join(handlerDir, 'issue-memo.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      // 管理系は低頻度。暴走・濫用時の同時実行を絞る(コスト暴走の上限)
      reservedConcurrentExecutions: 5,
    });
    // 発行は users(カウンタ)+ memos + tokens + tabs を1つの TransactWrite で書く
    props.usersTable.grantWriteData(issueMemoFn);
    props.memosTable.grantWriteData(issueMemoFn);
    props.tokensTable.grantWriteData(issueMemoFn);
    props.tabsTable.grantWriteData(issueMemoFn);
    for (const t of [props.usersTable, props.memosTable, props.tokensTable, props.tabsTable]) {
      t.grant(issueMemoFn, 'dynamodb:TransactWriteItems');
    }

    // --- list memos (管理: 自分のメモ一覧) ---
    const listMemosFn = new nodejs.NodejsFunction(this, 'ListMemosFn', {
      runtime,
      entry: path.join(handlerDir, 'list-memos.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      reservedConcurrentExecutions: 5,
    });
    props.memosTable.grantReadData(listMemosFn); // GSI by_owner の Query を含む

    // --- get memo (公開: 秘密URLトークンでメモ+タブ取得) ---
    // 未認証エンドポイント。users テーブルには一切アクセスさせない(最小権限)。
    const getMemoFn = new nodejs.NodejsFunction(this, 'GetMemoFn', {
      runtime,
      entry: path.join(handlerDir, 'get-memo.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      reservedConcurrentExecutions: 20,
    });
    props.tokensTable.grantReadData(getMemoFn);
    props.memosTable.grantReadData(getMemoFn);
    props.tabsTable.grantReadData(getMemoFn);

    // --- 管理系(再発行/失効/削除/リネーム) ---
    const adminFn = (id: string, entry: string) =>
      new nodejs.NodejsFunction(this, id, {
        runtime,
        entry: path.join(handlerDir, entry),
        handler: 'handler',
        environment: commonEnv,
        bundling,
        reservedConcurrentExecutions: 5,
      });

    const reissueFn = adminFn('ReissueFn', 'admin-reissue.ts');
    props.memosTable.grantReadWriteData(reissueFn);
    props.tokensTable.grantReadWriteData(reissueFn);
    props.memosTable.grant(reissueFn, 'dynamodb:TransactWriteItems');
    props.tokensTable.grant(reissueFn, 'dynamodb:TransactWriteItems');

    const revokeFn = adminFn('RevokeFn', 'admin-revoke.ts');
    props.memosTable.grantReadWriteData(revokeFn);
    props.tokensTable.grantReadWriteData(revokeFn);
    props.memosTable.grant(revokeFn, 'dynamodb:TransactWriteItems');
    props.tokensTable.grant(revokeFn, 'dynamodb:TransactWriteItems');

    const deleteMemoFn = adminFn('DeleteMemoFn', 'admin-delete-memo.ts');
    props.memosTable.grantReadWriteData(deleteMemoFn);
    props.tokensTable.grantReadWriteData(deleteMemoFn);
    props.tabsTable.grantReadWriteData(deleteMemoFn); // タブのカスケード削除
    props.usersTable.grantWriteData(deleteMemoFn); // 無料枠カウンタの返却
    props.memosTable.grant(deleteMemoFn, 'dynamodb:TransactWriteItems');
    props.tokensTable.grant(deleteMemoFn, 'dynamodb:TransactWriteItems');

    const renameFn = adminFn('RenameFn', 'admin-rename.ts');
    props.memosTable.grantReadWriteData(renameFn);

    // --- 書き込み系(公開: 保存/タブ追加/タブ削除/離脱時フラッシュ) ---
    // いずれも未認証。resolveTokenThrottled がトークンアイテムへの条件付き Update で
    // 有効性検証とレート制御を同時に行うため tokens は RW。users には一切アクセスさせない。
    const writeGrants = (fn: nodejs.NodejsFunction, transact: boolean) => {
      props.tokensTable.grantReadWriteData(fn);
      props.tabsTable.grantReadWriteData(fn);
      props.memosTable.grantReadWriteData(fn); // tab_count カウンタ / updated_at
      if (transact) {
        props.memosTable.grant(fn, 'dynamodb:TransactWriteItems');
        props.tabsTable.grant(fn, 'dynamodb:TransactWriteItems');
      }
    };

    const saveTabFn = new nodejs.NodejsFunction(this, 'SaveTabFn', {
      runtime,
      entry: path.join(handlerDir, 'save-tab.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      reservedConcurrentExecutions: 20,
    });
    writeGrants(saveTabFn, false);

    const createTabFn = new nodejs.NodejsFunction(this, 'CreateTabFn', {
      runtime,
      entry: path.join(handlerDir, 'create-tab.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      reservedConcurrentExecutions: 10,
    });
    writeGrants(createTabFn, true);

    const deleteTabFn = new nodejs.NodejsFunction(this, 'DeleteTabFn', {
      runtime,
      entry: path.join(handlerDir, 'delete-tab.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      reservedConcurrentExecutions: 10,
    });
    writeGrants(deleteTabFn, true);

    const flushFn = new nodejs.NodejsFunction(this, 'FlushFn', {
      runtime,
      entry: path.join(handlerDir, 'flush.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      timeout: cdk.Duration.seconds(15), // 最大12タブの逐次保存
      reservedConcurrentExecutions: 10,
    });
    writeGrants(flushFn, false);

    this.issueMemoFn = issueMemoFn;
    this.getMemoFn = getMemoFn;
    this.saveTabFn = saveTabFn;
    this.flushFn = flushFn;

    // ---- ルーティング ----
    // CloudFront の /api/* ビヘイビアが /api プレフィックスを剥がして origin に渡すため、
    // ここでは /admin/... /m/... で定義する(uraneko と同じ構成)。
    const admin = this.api.root.addResource('admin');
    const adminMemos = admin.addResource('memos');
    adminMemos.addMethod('GET', new apigateway.LambdaIntegration(listMemosFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    adminMemos.addMethod('POST', new apigateway.LambdaIntegration(issueMemoFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    const adminMemoById = adminMemos.addResource('{memo_id}');
    const adminAuth = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };
    adminMemoById.addMethod('PATCH', new apigateway.LambdaIntegration(renameFn), adminAuth);
    adminMemoById.addMethod('DELETE', new apigateway.LambdaIntegration(deleteMemoFn), adminAuth);
    adminMemoById
      .addResource('reissue')
      .addMethod('POST', new apigateway.LambdaIntegration(reissueFn), adminAuth);
    adminMemoById
      .addResource('revoke')
      .addMethod('POST', new apigateway.LambdaIntegration(revokeFn), adminAuth);

    const m = this.api.root.addResource('m');
    m.addResource('get').addMethod('POST', new apigateway.LambdaIntegration(getMemoFn));
    const mTabs = m.addResource('tabs');
    mTabs.addResource('save').addMethod('POST', new apigateway.LambdaIntegration(saveTabFn));
    mTabs.addResource('create').addMethod('POST', new apigateway.LambdaIntegration(createTabFn));
    mTabs.addResource('delete').addMethod('POST', new apigateway.LambdaIntegration(deleteTabFn));
    m.addResource('flush').addMethod('POST', new apigateway.LambdaIntegration(flushFn));

    new cdk.CfnOutput(this, 'NotesApiUrl', { value: this.api.url });
  }
}
