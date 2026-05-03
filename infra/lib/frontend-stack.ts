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

interface FrontendStackProps extends cdk.StackProps {
  api: apigateway.RestApi;
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
  domainName: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 bucket for SPA
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: 'rou39-site',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront Function to strip /api prefix
    const apiRewriteFn = new cloudfront.Function(this, 'ApiRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          request.uri = request.uri.replace(/^\\/api/, '');
          if (request.uri === '') request.uri = '/';
          return request;
        }
      `),
      functionName: 'portfolio-api-rewrite',
    });

    // CloudFront Function to serve OGP HTML for social media crawlers
    const ogpRewriteFn = new cloudfront.Function(this, 'OgpRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var ua = request.headers['user-agent'] ? request.headers['user-agent'].value : '';
          var uri = request.uri;
          var bots = ['Twitterbot','facebookexternalhit','Discordbot','Slackbot','LinkedInBot','WhatsApp','TelegramBot','Applebot'];
          var isCrawler = false;
          for (var i = 0; i < bots.length; i++) {
            if (ua.indexOf(bots[i]) !== -1) { isCrawler = true; break; }
          }
          if (isCrawler && /^\\/apps\\/[a-z0-9-]+$/.test(uri)) {
            request.uri = '/_ogp/' + uri.replace('/apps/', '') + '.html';
          }
          return request;
        }
      `),
      functionName: 'portfolio-ogp-rewrite',
    });

    // Security response headers
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'portfolio-security-headers',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        // /relations は同オリジンの iframe で /relations-app/* を埋め込むため SAMEORIGIN
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.SAMEORIGIN, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: { accessControlMaxAge: cdk.Duration.days(365), includeSubdomains: true, override: true },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [{
          function: ogpRewriteFn,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(props.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          functionAssociations: [{
            function: apiRewriteFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
        },
      },
      domainNames: [props.domainName, `www.${props.domainName}`],
      certificate: props.certificate,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });

    // Route 53 DNS records
    new route53.ARecord(this, 'SiteARecord', {
      zone: props.hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });
    new route53.ARecord(this, 'SiteWwwARecord', {
      zone: props.hostedZone,
      recordName: 'www',
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // Deploy frontend to S3
    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../frontend/dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${props.domainName}`,
    });
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
