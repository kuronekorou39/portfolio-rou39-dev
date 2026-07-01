import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import * as path from 'path';

interface UranekoApiStackProps extends cdk.StackProps {
  productsTable: dynamodb.ITable;
  tokensTable: dynamodb.ITable;
  ordersTable: dynamodb.ITable;
  couponsTable: dynamodb.ITable;
  assetsBucket: s3.IBucket;
  userPool: cognito.IUserPool;
  nowpaymentsApiKey: secretsmanager.ISecret;
  nowpaymentsIpnSecret: secretsmanager.ISecret;
  siteUrl: string; // https://uraneko.rou39.com
  fromEmail: string; // noreply@uraneko.rou39.com
  orderAccessSecret: secretsmanager.ISecret;
}

export class UranekoApiStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: UranekoApiStackProps) {
    super(scope, id, props);

    this.api = new apigateway.RestApi(this, 'UranekoApi', {
      restApiName: 'uraneko-api',
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
      PRODUCTS_TABLE: props.productsTable.tableName,
      TOKENS_TABLE: props.tokensTable.tableName,
      ORDERS_TABLE: props.ordersTable.tableName,
      COUPONS_TABLE: props.couponsTable.tableName,
      ASSETS_BUCKET: props.assetsBucket.bucketName,
      URANEKO_SITE_URL: props.siteUrl,
      URANEKO_API_URL: `${props.siteUrl}/api`,
      URANEKO_FROM_EMAIL: props.fromEmail,
      NOWPAYMENTS_API_KEY_SECRET: props.nowpaymentsApiKey.secretName,
      NOWPAYMENTS_IPN_SECRET_SECRET: props.nowpaymentsIpnSecret.secretName,
      ORDER_ACCESS_SECRET_SECRET: props.orderAccessSecret.secretName,
    };

    const bundling = { externalModules: ['@aws-sdk/*'] };
    const runtime = lambda.Runtime.NODEJS_20_X;
    const handlerDir = path.join(__dirname, '../../../backend/src/handlers/uraneko');

    // SES 送信は uraneko の送信ドメイン identity に限定(resource:'*' の過剰付与を避ける)
    const sesDomain = props.fromEmail.split('@')[1] ?? props.fromEmail;
    const sesIdentityArn = `arn:aws:ses:${this.region}:${this.account}:identity/${sesDomain}`;

    // --- list products ---
    const listProductsFn = new nodejs.NodejsFunction(this, 'ListProductsFn', {
      runtime,
      entry: path.join(handlerDir, 'list-products.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
    });
    props.productsTable.grantReadData(listProductsFn);

    // --- get product ---
    const getProductFn = new nodejs.NodejsFunction(this, 'GetProductFn', {
      runtime,
      entry: path.join(handlerDir, 'get-product.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
    });
    props.productsTable.grantReadData(getProductFn);

    // --- checkout (ログインでもゲストでも動く、Cognito 認証は任意) ---
    const checkoutFn = new nodejs.NodejsFunction(this, 'CheckoutFn', {
      runtime,
      entry: path.join(handlerDir, 'checkout.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      timeout: cdk.Duration.seconds(15),
    });
    props.productsTable.grantReadData(checkoutFn);
    props.ordersTable.grantReadWriteData(checkoutFn);
    props.couponsTable.grantReadWriteData(checkoutFn);
    props.nowpaymentsApiKey.grantRead(checkoutFn);
    // 100%割引(無料購入)経路は checkout 内で直接フルフィルするため、
    // webhook と同等の権限(トークン割当・注文アクセス署名・SES送信)が必要。
    props.tokensTable.grantReadWriteData(checkoutFn);
    props.orderAccessSecret.grantRead(checkoutFn);
    checkoutFn.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [sesIdentityArn],
      }),
    );

    // --- webhook (認証なし、HMAC 検証で認可) ---
    const webhookFn = new nodejs.NodejsFunction(this, 'WebhookFn', {
      runtime,
      entry: path.join(handlerDir, 'webhook.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
      timeout: cdk.Duration.seconds(30),
    });
    props.ordersTable.grantReadWriteData(webhookFn);
    props.tokensTable.grantReadWriteData(webhookFn);
    props.productsTable.grantReadData(webhookFn);
    props.nowpaymentsIpnSecret.grantRead(webhookFn);
    props.orderAccessSecret.grantRead(webhookFn);
    webhookFn.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [sesIdentityArn],
      }),
    );

    // --- get order (Cognito or signed token) ---
    const getOrderFn = new nodejs.NodejsFunction(this, 'GetOrderFn', {
      runtime,
      entry: path.join(handlerDir, 'get-order.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
    });
    props.ordersTable.grantReadData(getOrderFn);
    props.tokensTable.grantReadData(getOrderFn);
    props.assetsBucket.grantRead(getOrderFn);
    props.orderAccessSecret.grantRead(getOrderFn);

    // --- my orders (Cognito required) ---
    const myOrdersFn = new nodejs.NodejsFunction(this, 'MyOrdersFn', {
      runtime,
      entry: path.join(handlerDir, 'my-orders.ts'),
      handler: 'handler',
      environment: commonEnv,
      bundling,
    });
    props.ordersTable.grantReadData(myOrdersFn);

    // ---- ルーティング ----
    const products = this.api.root.addResource('products');
    products.addMethod('GET', new apigateway.LambdaIntegration(listProductsFn));
    const productById = products.addResource('{product_id}');
    productById.addMethod('GET', new apigateway.LambdaIntegration(getProductFn));

    const checkout = this.api.root.addResource('checkout');
    checkout.addMethod('POST', new apigateway.LambdaIntegration(checkoutFn));
    // NOTE: checkout は Cognito 任意。明示的に authorizer を付けないことで、
    // ゲスト購入(Authorization ヘッダー無し)にも対応。
    // ログインユーザーの場合はフロントが Authorization ヘッダーを付ける → claims が乗る

    const webhooks = this.api.root.addResource('webhooks');
    const npWebhook = webhooks.addResource('nowpayments');
    npWebhook.addMethod('POST', new apigateway.LambdaIntegration(webhookFn));

    const orders = this.api.root.addResource('orders');
    const orderById = orders.addResource('{order_id}');
    orderById.addMethod('GET', new apigateway.LambdaIntegration(getOrderFn));

    const myApi = this.api.root.addResource('my');
    const myOrders = myApi.addResource('orders');
    myOrders.addMethod('GET', new apigateway.LambdaIntegration(myOrdersFn), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    new cdk.CfnOutput(this, 'UranekoApiUrl', { value: this.api.url });
  }
}
