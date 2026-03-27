import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';
import * as path from 'path';

interface ApiStackProps extends cdk.StackProps {
  projectsTable: dynamodb.Table;
  reviewsTable: dynamodb.Table;
  pageViewsTable: dynamodb.Table;
  assetsBucket: s3.Bucket;
  userPool: cognito.UserPool;
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

    const downloads = this.api.root.addResource('downloads');
    const downloadByProject = downloads.addResource('{projectId}');
    downloadByProject.addMethod('GET', new apigateway.LambdaIntegration(downloadsFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

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

    new cdk.CfnOutput(this, 'ApiUrl', { value: this.api.url });
  }
}
