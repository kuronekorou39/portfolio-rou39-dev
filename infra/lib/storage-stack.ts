import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export class StorageStack extends cdk.Stack {
  public readonly projectsTable: dynamodb.Table;
  public readonly reviewsTable: dynamodb.Table;
  public readonly pageViewsTable: dynamodb.Table;
  public readonly interestsTable: dynamodb.Table;
  public readonly commentsTable: dynamodb.Table;
  public readonly honeypotTable: dynamodb.Table;
  public readonly gameScoresTable: dynamodb.Table;
  public readonly clipsTable: dynamodb.Table;
  public readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Projects table
    this.projectsTable = new dynamodb.Table(this, 'ProjectsTable', {
      tableName: 'portfolio-projects',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Reviews table
    this.reviewsTable = new dynamodb.Table(this, 'ReviewsTable', {
      tableName: 'portfolio-reviews',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Reviews by user (for "my reviews" query)
    this.reviewsTable.addGlobalSecondaryIndex({
      indexName: 'byUserId',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Page views table
    this.pageViewsTable = new dynamodb.Table(this, 'PageViewsTable', {
      tableName: 'portfolio-page-views',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Interests table (coming-soon projects)
    this.interestsTable = new dynamodb.Table(this, 'InterestsTable', {
      tableName: 'portfolio-interests',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Comments table (coming-soon projects)
    this.commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: 'portfolio-comments',
      partitionKey: { name: 'projectId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Honeypot logs table
    this.honeypotTable = new dynamodb.Table(this, 'HoneypotTable', {
      tableName: 'portfolio-honeypot-logs',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
    });

    // Game scores table
    this.gameScoresTable = new dynamodb.Table(this, 'GameScoresTable', {
      tableName: 'portfolio-game-scores',
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.gameScoresTable.addGlobalSecondaryIndex({
      indexName: 'by-mode-score',
      partitionKey: { name: 'mode', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'score', type: dynamodb.AttributeType.NUMBER },
    });

    // Clips table (text sharing, TTL-based auto-delete)
    this.clipsTable = new dynamodb.Table(this, 'ClipsTable', {
      tableName: 'portfolio-clips',
      partitionKey: { name: 'code', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // Assets bucket (screenshots, app files)
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `portfolio-assets-${this.account}`,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
  }
}
