import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  projectsTable: dynamodb.Table;
  reviewsTable: dynamodb.Table;
  pageViewsTable: dynamodb.Table;
  interestsTable: dynamodb.Table;
  commentsTable: dynamodb.Table;
  honeypotTable: dynamodb.Table;
  gameScoresTable: dynamodb.Table;
  clipsTable: dynamodb.Table;
  contactsTable: dynamodb.Table;
  cacheTable: dynamodb.Table;
  assetsBucket: s3.Bucket;
  userPool: cognito.UserPool;
  githubTokenSecret: secretsmanager.ISecret;
}

export class ApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // REST API
    this.api = new apigateway.RestApi(this, 'PortfolioApi', {
      restApiName: 'portfolio-api',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
    });

    // Shared environment variables for Lambda
    const commonEnv = {
      PROJECTS_TABLE: props.projectsTable.tableName,
      REVIEWS_TABLE: props.reviewsTable.tableName,
      PAGE_VIEWS_TABLE: props.pageViewsTable.tableName,
      INTERESTS_TABLE: props.interestsTable.tableName,
      COMMENTS_TABLE: props.commentsTable.tableName,
      HONEYPOT_TABLE: props.honeypotTable.tableName,
      ASSETS_BUCKET: props.assetsBucket.bucketName,
    };

    const bundlingOptions = {
      externalModules: ['@aws-sdk/*'],
    };

    // --- Projects API ---
    const projectsFn = new nodejs.NodejsFunction(this, 'ProjectsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/projects.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.projectsTable.grantReadData(projectsFn);

    const projects = this.api.root.addResource('projects');
    projects.addMethod('GET', new apigateway.LambdaIntegration(projectsFn));

    const projectById = projects.addResource('{id}');
    projectById.addMethod('GET', new apigateway.LambdaIntegration(projectsFn));

    // --- Reviews API ---
    const reviewsFn = new nodejs.NodejsFunction(this, 'ReviewsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/reviews.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.reviewsTable.grantReadWriteData(reviewsFn);

    const reviews = this.api.root.addResource('reviews');
    const reviewsByProject = reviews.addResource('{projectId}');
    reviewsByProject.addMethod('GET', new apigateway.LambdaIntegration(reviewsFn));
    reviewsByProject.addMethod('POST', new apigateway.LambdaIntegration(reviewsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const reviewById = reviewsByProject.addResource('{reviewId}');
    reviewById.addMethod('PUT', new apigateway.LambdaIntegration(reviewsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    reviewById.addMethod('DELETE', new apigateway.LambdaIntegration(reviewsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // --- Downloads API ---
    const downloadsFn = new nodejs.NodejsFunction(this, 'DownloadsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/downloads.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.projectsTable.grantReadData(downloadsFn);
    props.assetsBucket.grantRead(downloadsFn);
    props.pageViewsTable.grantReadWriteData(downloadsFn);

    const downloads = this.api.root.addResource('downloads');
    const downloadByProject = downloads.addResource('{projectId}');
    downloadByProject.addMethod('GET', new apigateway.LambdaIntegration(downloadsFn));

    // --- Page Views API ---
    const pageViewsFn = new nodejs.NodejsFunction(this, 'PageViewsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/page-views.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.pageViewsTable.grantReadWriteData(pageViewsFn);

    const pageViews = this.api.root.addResource('page-views');
    const pageViewsByProject = pageViews.addResource('{projectId}');
    pageViewsByProject.addMethod('POST', new apigateway.LambdaIntegration(pageViewsFn));
    pageViewsByProject.addMethod('GET', new apigateway.LambdaIntegration(pageViewsFn));

    // --- Interests API ---
    const interestsFn = new nodejs.NodejsFunction(this, 'InterestsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/interests.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.interestsTable.grantReadWriteData(interestsFn);

    const interests = this.api.root.addResource('interests');
    const interestsByProject = interests.addResource('{projectId}');
    interestsByProject.addMethod('GET', new apigateway.LambdaIntegration(interestsFn));
    interestsByProject.addMethod('POST', new apigateway.LambdaIntegration(interestsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });
    interestsByProject.addMethod('DELETE', new apigateway.LambdaIntegration(interestsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // --- Comments API ---
    const commentsFn = new nodejs.NodejsFunction(this, 'CommentsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/comments.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.commentsTable.grantReadWriteData(commentsFn);

    const comments = this.api.root.addResource('comments');
    const commentsByProject = comments.addResource('{projectId}');
    commentsByProject.addMethod('GET', new apigateway.LambdaIntegration(commentsFn));
    commentsByProject.addMethod('POST', new apigateway.LambdaIntegration(commentsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const commentById = commentsByProject.addResource('{commentId}');
    commentById.addMethod('DELETE', new apigateway.LambdaIntegration(commentsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    const replies = commentById.addResource('replies');
    replies.addMethod('GET', new apigateway.LambdaIntegration(commentsFn));
    replies.addMethod('POST', new apigateway.LambdaIntegration(commentsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // --- Honeypot API (no auth) ---
    const honeypotFn = new nodejs.NodejsFunction(this, 'HoneypotFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/honeypot.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling: bundlingOptions,
    });
    props.honeypotTable.grantReadWriteData(honeypotFn);

    const honeypot = this.api.root.addResource('honeypot');
    const honeypotLog = honeypot.addResource('log');
    honeypotLog.addMethod('POST', new apigateway.LambdaIntegration(honeypotFn));

    // --- Game Scores API (no auth — anyone can submit/view) ---
    const gameScoresFn = new nodejs.NodejsFunction(this, 'GameScoresFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/game-scores.ts'),
      handler: 'handler',
      environment: {
        GAME_SCORES_TABLE: props.gameScoresTable.tableName,
      },
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
    });
    props.gameScoresTable.grantReadWriteData(gameScoresFn);

    const gameScores = this.api.root.addResource('game-scores');
    gameScores.addMethod('GET', new apigateway.LambdaIntegration(gameScoresFn));
    gameScores.addMethod('POST', new apigateway.LambdaIntegration(gameScoresFn));

    // --- Clip API (text sharing, no auth) ---
    const clipFn = new nodejs.NodejsFunction(this, 'ClipFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/clip.ts'),
      handler: 'handler',
      environment: {
        CLIPS_TABLE: props.clipsTable.tableName,
      },
      bundling: bundlingOptions,
    });
    props.clipsTable.grantReadWriteData(clipFn);

    const clip = this.api.root.addResource('clip');
    clip.addMethod('POST', new apigateway.LambdaIntegration(clipFn));
    const clipByCode = clip.addResource('{code}');
    clipByCode.addMethod('GET', new apigateway.LambdaIntegration(clipFn));

    // --- Contact API (inquiry form, no auth) ---
    const contactFromEmail = 'noreply@rou39.com';
    const contactFn = new nodejs.NodejsFunction(this, 'ContactFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/contact.ts'),
      handler: 'handler',
      environment: {
        CONTACTS_TABLE: props.contactsTable.tableName,
        NOTIFY_EMAIL: 'kuronekorou39@gmail.com',
        FROM_EMAIL: contactFromEmail,
      },
      bundling: bundlingOptions,
    });
    props.contactsTable.grantReadWriteData(contactFn);
    // SES 送信は送信元ドメインの identity に限定する('*' だと uraneko 含む
    // アカウント内の全 identity から送信できてしまう)。uraneko/api-stack.ts と同方式。
    contactFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${contactFromEmail.split('@')[1]}`,
        ],
      }),
    );

    const contact = this.api.root.addResource('contact');
    contact.addMethod('POST', new apigateway.LambdaIntegration(contactFn));

    // --- Contributions API (GitHub grass, cached) ---
    const contributionsFn = new nodejs.NodejsFunction(this, 'ContributionsFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../backend/src/handlers/contributions.ts'),
      handler: 'handler',
      environment: {
        CACHE_TABLE: props.cacheTable.tableName,
        // トークン本体は渡さず、シークレット名だけを渡して実行時に取得する
        // (env 平文だと CFN テンプレートに露出し、CI デプロイ時に .env が無く
        // 空文字で上書きされる事故もあった。uraneko の NOWPayments と同方式)
        GITHUB_TOKEN_SECRET: props.githubTokenSecret.secretName,
        GITHUB_USER: 'kuronekorou39',
      },
      bundling: bundlingOptions,
      timeout: cdk.Duration.seconds(10),
    });
    props.cacheTable.grantReadWriteData(contributionsFn);
    props.githubTokenSecret.grantRead(contributionsFn);

    const contributions = this.api.root.addResource('contributions');
    contributions.addMethod('GET', new apigateway.LambdaIntegration(contributionsFn));

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.url });
  }
}
