import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export class UranekoStorageStack extends cdk.Stack {
  public readonly productsTable: dynamodb.Table;
  public readonly tokensTable: dynamodb.Table;
  public readonly ordersTable: dynamodb.Table;
  public readonly couponsTable: dynamodb.Table;
  public readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 商品マスタ
    this.productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: 'uraneko-video-products',
      partitionKey: { name: 'product_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, // バックアップ(誤操作/バグからの復旧。実金を扱うため必須)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 透かしトークン在庫
    this.tokensTable = new dynamodb.Table(this, 'TokensTable', {
      tableName: 'uraneko-video-tokens',
      partitionKey: { name: 'token_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, // バックアップ(誤操作/バグからの復旧。実金を扱うため必須)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 未割当トークンを古い順に取得するための GSI
    // SK は "unassigned#2026-04-23T..." の形(status#created_at)で書き込む
    this.tokensTable.addGlobalSecondaryIndex({
      indexName: 'by_product_status',
      partitionKey: { name: 'product_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status_created_at', type: dynamodb.AttributeType.STRING },
    });

    // 購入記録
    this.ordersTable = new dynamodb.Table(this, 'OrdersTable', {
      tableName: 'uraneko-orders',
      partitionKey: { name: 'order_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, // バックアップ(誤操作/バグからの復旧。実金を扱うため必須)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ログインユーザーの購入履歴取得用
    this.ordersTable.addGlobalSecondaryIndex({
      indexName: 'by_user',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'created_at', type: dynamodb.AttributeType.STRING },
    });

    // クーポン(特定商品限定・総利用上限で管理)
    this.couponsTable = new dynamodb.Table(this, 'CouponsTable', {
      tableName: 'uraneko-coupons',
      partitionKey: { name: 'coupon_code', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, // バックアップ(誤操作/バグからの復旧。実金を扱うため必須)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // 動画資産(stego mp4, サムネ等)
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `uraneko-assets-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // 実金コンテンツ(再生成に GPU コストがかかる stego mp4)の誤上書き/削除からの復旧。
      // 過去に本番サムネを上書きして復元不能になった前例があるため有効化。
      versioned: true,
      // aws:SecureTransport=false を Deny(平文アクセス拒否の多層防御)。
      enforceSSL: true,
      lifecycleRules: [
        {
          // 旧バージョンは 90 日で失効(復旧の猶予は確保しつつ、無制限な容量増を防ぐ)。
          noncurrentVersionExpiration: cdk.Duration.days(90),
          // 中断したマルチパートアップロードの残骸を 7 日で掃除。
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['https://uraneko.rou39.com'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    new cdk.CfnOutput(this, 'AssetsBucketName', { value: this.assetsBucket.bucketName });
  }
}
