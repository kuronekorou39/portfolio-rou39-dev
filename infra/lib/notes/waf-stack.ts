import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

/**
 * notes.rou39.com の CloudFront 用 WAFv2 WebACL。
 *
 * 【位置づけ】ここは defense-in-depth であって主防御ではない。
 * origin(execute-api)は直接叩けるので IP レート制限はバイパス可能だし、
 * 秘密トークンは POST body 内で WAF からは見えない。書き込み濫用の実制御は
 * アプリ層(resolveTokenThrottled の per-token スロットル + 予約同時実行上限)。
 * WAF は「CloudFront 経由の雑なフラッド/スクレイピングのコストを安く落とす」層。
 *
 * IP 評価リスト(AmazonIpReputationList)は uraneko 同様に不採用。
 * VPN 経由で自分のメモを開く正当利用を誤ブロックする副作用を避ける。
 *
 * 注: CloudFront に紐付ける WebACL は scope=CLOUDFRONT のためリージョンは us-east-1 必須。
 */
export class NotesWafStack extends cdk.Stack {
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

    const webAcl = new wafv2.CfnWebACL(this, 'NotesWebAcl', {
      name: 'notes-cloudfront-webacl',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: 'NotesWebAcl',
      },
      rules: [
        {
          // API 全体: 1 IP あたり 5 分で 600 リクエスト超をブロック。
          // 正当利用の上限は自動保存(per-token で最大 1回/秒 = 300/5分)+ 取得/フラッシュで
          // 十分収まる値。これを超える IP は連射スクリプトとみなしてよい。
          name: 'ApiRateLimit',
          priority: 0,
          statement: {
            rateBasedStatement: {
              limit: 600,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: pathStartsWith('/api/'),
            },
          },
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: 'ApiRateLimit',
          },
        },
        {
          // 全体: 1 IP あたり 5 分で 1000 リクエスト超をブロック(スクレイピング/DoS 抑制)。
          name: 'GeneralRateLimit',
          priority: 1,
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

    new cdk.CfnOutput(this, 'NotesWebAclArn', {
      value: this.webAclArn,
      description: 'notes CloudFront WebACL ARN (us-east-1)',
    });
  }
}
