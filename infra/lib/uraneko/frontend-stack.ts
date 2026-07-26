import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

interface UranekoFrontendStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
  subdomain: string; // uraneko.rou39.com
  webAclArn: string; // us-east-1 の WAFv2 WebACL ARN(決済悪用対策のレート制限)
}

export class UranekoFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UranekoFrontendStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'UranekoSiteBucket', {
      bucketName: 'uraneko-site',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // 中断した多段アップロードの残骸を自動中止(未完了パートは可視化されないまま課金される)
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
    });

    // アクセスログ用バケット(CloudFront 標準ログ)。アクセス数を「軽く」把握する用。
    // - CloudFront 標準ログ(レガシー)は ACL でログ配信アカウントに書き込むため、
    //   バケットは ACL 有効(BUCKET_OWNER_PREFERRED)にする必要がある。
    // - ログには IP / User-Agent が含まれる(個人情報)ので lifecycle で 90 日後に自動削除する。
    const logBucket = new s3.Bucket(this, 'UranekoAccessLogs', {
      bucketName: `uraneko-access-logs-${this.account}`,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // CloudFront Function: /api/* の prefix を strip して API Gateway に送る
    const apiRewriteFn = new cloudfront.Function(this, 'UranekoApiRewrite', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          request.uri = request.uri.replace(/^\\/api/, '');
          if (request.uri === '') request.uri = '/';
          return request;
        }
      `),
      functionName: 'uraneko-api-rewrite',
    });

    // SPA ルーティング: 拡張子の無いパス(=React Router のルート)を index.html に書き換える。
    // これにより distribution レベルの errorResponses(403/404→index.html)を使わずに済み、
    // /api/* の 403/404(get-order 未認可・商品404・webhook 署名NG)が SPA HTML に化けなくなる。
    const spaRewriteFn = new cloudfront.Function(this, 'UranekoSpaRewrite', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          var last = uri.substring(uri.lastIndexOf('/') + 1);
          if (uri !== '/' && last.indexOf('.') === -1) {
            request.uri = '/index.html';
          }
          return request;
        }
      `),
      functionName: 'uraneko-spa-rewrite',
    });

    // CSP。許可元はフロントの実依存から割り出した最小構成:
    //  - script-src 'self': バンドルは同一オリジン。インライン script は無い。
    //  - style-src 'unsafe-inline' + fonts.googleapis.com: React のインライン style と Google Fonts CSS。
    //  - font-src fonts.gstatic.com: Google Fonts 本体。
    //  - img-src https:: 商品サムネ/サンプルは S3 presigned URL(https)。
    //  - connect-src: /api(self)+ Cognito トークン交換(uraneko-auth.rou39.com)+ セッション更新(cognito-idp)。
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'",
      "connect-src 'self' https://uraneko-auth.rou39.com https://cognito-idp.ap-northeast-1.amazonaws.com",
      "form-action 'self'",
    ].join('; ');

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'UranekoSecurityHeaders', {
      responseHeadersPolicyName: 'uraneko-security-headers',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
        contentSecurityPolicy: { contentSecurityPolicy, override: true },
      },
    });

    // /api/* 用キャッシュポリシー。CloudFront は GET/HEAD の Authorization ヘッダーを
    // 「キャッシュキーに含めた場合」しか origin に転送しない(POST 等は転送される)。
    // CACHING_DISABLED のままだと会員の GET /my/orders 等がトークン無しで届き 401 になる。
    // TTL 0/0/1秒 + Authorization をキーに含めることで、実質キャッシュ無効のまま転送する。
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'UranekoApiCachePolicy', {
      cachePolicyName: 'uraneko-api-auth-forward',
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
    });

    const distribution = new cloudfront.Distribution(this, 'UranekoDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [
          { function: spaRewriteFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(props.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: apiCachePolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // x-nowpayments-sig などのカスタムヘッダーを origin に forward する。
          // Host ヘッダーは API Gateway 側で execute-api ドメインを期待するので除外。
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            { function: apiRewriteFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
      domainNames: [props.subdomain],
      certificate: props.certificate,
      webAclId: props.webAclArn, // WAFv2 は ARN を webAclId に渡す
      defaultRootObject: 'index.html',
      // アクセスログを S3 に出す(cf/ プレフィックス、Cookie は記録しない)。
      enableLogging: true,
      logBucket,
      logFilePrefix: 'cf/',
      logIncludesCookies: false,
      // errorResponses は使わない(SPA ルーティングは spaRewriteFn が担当)。
      // これにより /api/* の 403/404 が index.html(200)に化けず、正しく伝わる。
    });

    new route53.ARecord(this, 'UranekoARecord', {
      zone: props.hostedZone,
      recordName: 'uraneko',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // frontend-uraneko/dist が存在する場合のみデプロイ。無い場合は空で作って CFN を通す。
    const distPath = path.join(__dirname, '../../../frontend-uraneko/dist');
    const sources: s3deploy.ISource[] = fs.existsSync(distPath)
      ? [s3deploy.Source.asset(distPath)]
      : [s3deploy.Source.data('placeholder.txt', 'uraneko frontend not yet built')];

    new s3deploy.BucketDeployment(this, 'DeployUranekoSite', {
      sources,
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    new cdk.CfnOutput(this, 'UranekoSiteUrl', { value: `https://${props.subdomain}` });
    new cdk.CfnOutput(this, 'UranekoDistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'UranekoAccessLogBucket', { value: logBucket.bucketName });
  }
}
