import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

/**
 * uraneko.rou39.com の CloudFront 用 WAFv2 WebACL。
 *
 * 主目的は決済フロー周りの悪用対策:
 *  - クーポンコードのブルートフォース(/api/coupons/validate 連打)
 *  - checkout スパム(/api/checkout 連打で pending 注文/予約を量産)
 *
 * 方針:
 *  - 決済 IPN(/api/webhooks/*)は最優先で必ず許可する。ここをレート制限で取りこぼすと
 *    入金確定(fulfill)を落として「支払い済み未納品」になるため、絶対にブロックしない。
 *  - checkout/coupon は厳しめのレート制限。通常購入は数リクエストで済む。
 *  - それ以外は緩め。サンプル画像ギャラリー等で1ページ数十リクエストになるため、
 *    正当な閲覧を誤ブロックしない値にする。
 *  - IP 評価リスト(AmazonIpReputationList)は使わない。R-18 という性質上、VPN/Tor 経由の
 *    正当な購入者を弾く副作用の方が損失が大きい。
 *
 * 注: CloudFront に紐付ける WebACL は scope=CLOUDFRONT のためリージョンは us-east-1 必須。
 *     ap-northeast-1 の UranekoFrontendStack からは crossRegionReferences で ARN を参照する。
 */
export class UranekoWafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const noneTransform = [{ priority: 0, type: 'NONE' }];
    const pathStartsWith = (searchString: string): wafv2.CfnWebACL.StatementProperty => ({
      byteMatchStatement: {
        fieldToMatch: { uriPath: {} },
        positionalConstraint: 'STARTS_WITH',
        searchString,
        textTransformations: noneTransform,
      },
    });

    const webAcl = new wafv2.CfnWebACL(this, 'UranekoWebAcl', {
      name: 'uraneko-cloudfront-webacl',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: 'UranekoWebAcl',
      },
      rules: [
        {
          // 決済 IPN は無条件で許可(Allow は terminating なので以降のレート制限を必ずスキップ)。
          name: 'AllowPaymentWebhook',
          priority: 0,
          statement: pathStartsWith('/api/webhooks'),
          action: { allow: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: 'AllowPaymentWebhook',
          },
        },
        {
          // checkout / coupon: 1 IP あたり 5 分で 50 リクエスト超をブロック。
          // 正常購入(クーポン適用の試行 + 注文作成)は数回で収まる。ブルートフォースを抑止。
          name: 'SensitiveApiRateLimit',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 50,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: {
                orStatement: {
                  statements: [pathStartsWith('/api/checkout'), pathStartsWith('/api/coupons')],
                },
              },
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: 'SensitiveApiRateLimit',
          },
        },
        {
          // 全体: 1 IP あたり 5 分で 1000 リクエスト超をブロック(スクレイピング/DoS 抑制)。
          name: 'GeneralRateLimit',
          priority: 2,
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: 'GeneralRateLimit',
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, 'UranekoWebAclArn', {
      value: this.webAclArn,
      description: 'uraneko CloudFront WebACL ARN (us-east-1)',
    });
  }
}
