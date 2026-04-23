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
}

export class UranekoFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: UranekoFrontendStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'UranekoSiteBucket', {
      bucketName: 'uraneko-site',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
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
      },
    });

    const distribution = new cloudfront.Distribution(this, 'UranekoDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(props.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          functionAssociations: [
            { function: apiRewriteFn, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
      domainNames: [props.subdomain],
      certificate: props.certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
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
  }
}
