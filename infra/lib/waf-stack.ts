import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

/**
 * CloudFront 用 WAFv2 WebACL。
 *
 * relations の「大量」プラン (329MB) が S3+CloudFront で配信されるため、
 * 単一 IP からの過剰アクセス (バズ・スクレイピング・誤クリック連打) を
 * 抑制してデータ転送費の暴発を防ぐ。
 *
 * 注: CloudFront に紐付ける WebACL は scope=CLOUDFRONT のため
 *     リージョンは us-east-1 必須。 ap-northeast-1 の FrontendStack からは
 *     crossRegionReferences で WebACL ARN を参照する。
 */
export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1 IP あたり 5 分間で 100 リクエストを超えたらブロック。
    // 通常閲覧 (ライト〜大量プランを 1 度ずつ読む) は 1 ページあたり数十リクエスト
    // 程度に収まるので 100 でも十分余裕。
    const webAcl = new wafv2.CfnWebACL(this, 'PortfolioWebAcl', {
      name: 'portfolio-cloudfront-webacl',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: 'PortfolioWebAcl',
      },
      rules: [
        {
          name: 'RateLimitPerIp',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 100,                  // 100 req / 5min / IP
              aggregateKeyType: 'IP',
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: 'RateLimitPerIp',
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAclArn,
      description: 'CloudFront WebACL ARN (us-east-1)',
    });
  }
}
