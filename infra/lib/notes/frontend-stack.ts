import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

interface NotesFrontendStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
  subdomain: string; // notes.rou39.com
  authDomain: string; // notes-auth.rou39.com(CSP connect-src 用)
  webAclArn?: string; // us-east-1 の WAFv2 WebACL ARN(P5 で付ける。無くても配信は成立)
  originVerifySecret: secretsmanager.ISecret; // /api/* オリジンに付ける x-origin-verify の値
}

export class NotesFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NotesFrontendStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'NotesSiteBucket', {
      // uraneko-site と違いアカウント suffix を付ける(グローバル一意名の衝突防止)
      bucketName: `notes-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // 中断した多段アップロードの残骸を自動中止(未完了パートは可視化されないまま課金される)
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
    });

    // CloudFront の標準アクセスログ。アクセス数をローカルから把握する用
    // (scripts/access/access-server.mjs。rou39 / uraneko と同じ仕組み)。
    // 秘密URLのトークンは location.hash にあるためサーバには送られず、ログには /m しか残らない。
    // 90 日で自動削除。プライバシーポリシーの「技術情報=サーバーログ / 90日保存」の範囲。
    // CloudFront ログ配信は ACL を使うので ObjectOwnership を
    // BUCKET_OWNER_PREFERRED (ACL 有効) にする必要がある。
    const logBucket = new s3.Bucket(this, 'NotesAccessLogs', {
      bucketName: `notes-access-logs-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Function: /api/* の prefix を strip して API Gateway に送る
    const apiRewriteFn = new cloudfront.Function(this, 'NotesApiRewrite', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          request.uri = request.uri.replace(/^\\/api/, '');
          if (request.uri === '') request.uri = '/';
          return request;
        }
      `),
      functionName: 'notes-api-rewrite',
    });

    // SPA ルーティング: 拡張子の無いパスを index.html に書き換える。
    // errorResponses(403/404→index.html)を使わないのは uraneko と同じ理由で、
    // /api/* の 404(失効トークンの一律404 等)が SPA HTML の 200 に化けると
    // フロントが「有効だが空のメモ」と誤認するため。API のステータスは素通しする。
    const spaRewriteFn = new cloudfront.Function(this, 'NotesSpaRewrite', {
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
      functionName: 'notes-spa-rewrite',
    });

    // CSP。notes は外部フォント/CDN/外部画像を使わない(メモ画面は外部依存ゼロが要件)ので
    // uraneko より狭い。connect-src は /api(self)+ Cognito トークン交換(notes-auth)+
    // セッション更新(cognito-idp)のみ。
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data:",
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'", // React のインライン style
      "script-src 'self'",
      `connect-src 'self' https://${props.authDomain} https://cognito-idp.ap-northeast-1.amazonaws.com`,
      "form-action 'self'",
    ].join('; ');

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'NotesSecurityHeaders', {
      responseHeadersPolicyName: 'notes-security-headers',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        // 秘密URL(フラグメントにトークン)のサービスなので no-referrer に固定。
        // フラグメント自体は Referer に載らないが、メモ画面からの遷移情報も一切漏らさない。
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
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
    // 「キャッシュキーに含めた場合」しか origin に転送しない。CACHING_DISABLED のままだと
    // 管理画面の GET /admin/memos がトークン無しで届き 401 になる(uraneko で実証済みの罠)。
    const apiCachePolicy = new cloudfront.CachePolicy(this, 'NotesApiCachePolicy', {
      cachePolicyName: 'notes-api-auth-forward',
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Authorization'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(0),
      maxTtl: cdk.Duration.seconds(1),
    });

    const distribution = new cloudfront.Distribution(this, 'NotesDistribution', {
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
          // オリジン(execute-api)に秘密ヘッダを付与。CloudFront はビューアが同名ヘッダを
          // 送ってきてもこのオリジン値で上書きするため、直叩き経路だけがこの値を持てない。
          // 値は CloudFormation の Secrets Manager 動的参照でデプロイ時に解決される
          //(解決可否は Lambda 側の Phase 1 観測ログで確認する)。
          origin: new origins.RestApiOrigin(props.api, {
            customHeaders: { 'x-origin-verify': props.originVerifySecret.secretValue.unsafeUnwrap() },
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: apiCachePolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          // Host ヘッダーは API Gateway 側で execute-api ドメインを期待するので除外
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          functionAssociations: [
            { function: apiRewriteFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
      domainNames: [props.subdomain],
      certificate: props.certificate,
      ...(props.webAclArn ? { webAclId: props.webAclArn } : {}),
      enableLogging: true,
      logBucket,
      logFilePrefix: 'cf/',
      logIncludesCookies: false,
      defaultRootObject: 'index.html',
    });

    new route53.ARecord(this, 'NotesARecord', {
      zone: props.hostedZone,
      recordName: 'notes',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // frontend-notes/dist が存在する場合のみデプロイ。無い場合は空で作って CFN を通す
    // (CI で build:notes が漏れても既存配信を placeholder で潰さないための uraneko 方式)。
    const distPath = path.join(__dirname, '../../../frontend-notes/dist');
    const sources: s3deploy.ISource[] = fs.existsSync(distPath)
      ? [s3deploy.Source.asset(distPath)]
      : [s3deploy.Source.data('placeholder.txt', 'notes frontend not yet built')];

    new s3deploy.BucketDeployment(this, 'DeployNotesSite', {
      sources,
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    new cdk.CfnOutput(this, 'NotesSiteUrl', { value: `https://${props.subdomain}` });
    new cdk.CfnOutput(this, 'NotesAccessLogBucket', { value: logBucket.bucketName });
    new cdk.CfnOutput(this, 'NotesDistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
