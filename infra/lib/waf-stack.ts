import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import type { Construct } from 'constructs';

export interface WafStackProps extends cdk.StackProps {
  /** 本家 (rou39.com) */
  domainName: string;
  /** uraneko.rou39.com */
  uranekoDomain: string;
  /** notes.rou39.com */
  notesDomain: string;
}

/**
 * 3サイト共通の CloudFront 用 WAFv2 WebACL。
 *
 * 【なぜ1つに統合したか】
 * WAF の課金は従量ではなく固定費で、WebACL 1個 $5/月 + ルール 1個 $1/月。
 * サイトごとに WebACL を分けていた頃は 3 ACL + 6 ルール = $21/月かかっていて、
 * 実リクエスト課金 ($0.03/月) の 700 倍という歪な構成だった。
 * CloudFront の WebACL は複数ディストリビューションに紐付けられるので、
 * 各ルールの scopeDownStatement に Host 条件を足して 1 ACL + 5 ルール = $10/月 に畳んだ。
 * レートの集計はルール単位なので、統合してもブロック挙動は分離時と変わらない。
 *
 * 【代償】1サイトの WAF 変更が3サイト全体に波及する。ルールを触るときは
 * 対象ホスト以外に影響が出ていないか、priority と scopeDown を必ず確認すること。
 *
 * 注: CloudFront に紐付ける WebACL は scope=CLOUDFRONT のためリージョンは us-east-1 必須。
 *     ap-northeast-1 の各 FrontendStack からは crossRegionReferences で ARN を参照する。
 */
export class WafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: WafStackProps) {
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

    // Host ヘッダ完全一致。CloudFront のビューワーリクエストを見るので
    // Host = ユーザーがアクセスしたホスト名。大文字混じりで来ても拾えるよう小文字化する。
    const hostIs = (host: string): wafv2.CfnWebACL.StatementProperty => ({
      byteMatchStatement: {
        fieldToMatch: { singleHeader: { name: 'host' } },
        positionalConstraint: 'EXACTLY',
        searchString: host,
        textTransformations: [{ priority: 0, type: 'LOWERCASE' }],
      },
    });

    const and = (
      ...statements: wafv2.CfnWebACL.StatementProperty[]
    ): wafv2.CfnWebACL.StatementProperty => ({ andStatement: { statements } });

    const or = (
      ...statements: wafv2.CfnWebACL.StatementProperty[]
    ): wafv2.CfnWebACL.StatementProperty => ({ orStatement: { statements } });

    const visibility = (metricName: string) => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName,
    });

    const webAcl = new wafv2.CfnWebACL(this, 'UnifiedWebAcl', {
      name: 'rou39-cloudfront-webacl',
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: visibility('Rou39WebAcl'),
      rules: [
        {
          // 決済 IPN は無条件で許可(Allow は terminating なので以降のレート制限を必ずスキップ)。
          // ここをレート制限で取りこぼすと入金確定(fulfill)を落として
          // 「支払い済み未納品」になるため、絶対にブロックしない。
          name: 'AllowUranekoPaymentWebhook',
          priority: 0,
          statement: and(hostIs(props.uranekoDomain), pathStartsWith('/api/webhooks')),
          action: { allow: {} },
          visibilityConfig: visibility('AllowUranekoPaymentWebhook'),
        },
        {
          // uraneko の checkout / coupon: 1 IP あたり 5 分で 50 リクエスト超をブロック。
          // 正常購入(クーポン適用の試行 + 注文作成)は数回で収まる。
          // クーポンコードのブルートフォースと checkout スパムを抑止する。
          name: 'UranekoSensitiveApiRateLimit',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 50,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: and(
                hostIs(props.uranekoDomain),
                or(pathStartsWith('/api/checkout'), pathStartsWith('/api/coupons')),
              ),
            },
          },
          action: { block: {} },
          visibilityConfig: visibility('UranekoSensitiveApiRateLimit'),
        },
        {
          // notes の API 全体: 1 IP あたり 5 分で 600 リクエスト超をブロック。
          // 正当利用の上限は自動保存(per-token で最大 1回/秒 = 300/5分)+ 取得/フラッシュで
          // 十分収まる値。これを超える IP は連射スクリプトとみなしてよい。
          // なおここは defense-in-depth であって主防御ではない(origin 直叩きは
          // x-origin-verify で塞ぎ、書き込み濫用の実制御はアプリ層のスロットル)。
          name: 'NotesApiRateLimit',
          priority: 2,
          statement: {
            rateBasedStatement: {
              limit: 600,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: and(hostIs(props.notesDomain), pathStartsWith('/api/')),
            },
          },
          action: { block: {} },
          visibilityConfig: visibility('NotesApiRateLimit'),
        },
        {
          // relations の巨大データ (最大 692MB/ファイル) だけを狙った転送費の暴発防止。
          // 取得は fetch() 1回のストリーミングで、プランを切り替えるたびに 1 リクエスト。
          // 4プラン全部試してもリロード込みで数リクエストなので 20 で十分余裕がある。
          //
          // 以前は rou39.com 全体に 100/5min をかけていたが、Vite の分割チャンクだけで
          // 1ページ数十リクエストに達するため正当な閲覧者を弾く恐れがあった。
          // 本来の目的(データ転送費)に効く data/ 配下へ絞り、
          // ページ全体は下の GeneralRateLimit (1000) に任せる。
          name: 'RelationsDataRateLimit',
          priority: 3,
          statement: {
            rateBasedStatement: {
              limit: 20,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
              scopeDownStatement: and(
                hostIs(props.domainName),
                pathStartsWith('/relations-app/data/'),
              ),
            },
          },
          action: { block: {} },
          visibilityConfig: visibility('RelationsDataRateLimit'),
        },
        {
          // 全ホスト共通: 1 IP あたり 5 分で 1000 リクエスト超をブロック
          // (スクレイピング / 雑なフラッドの抑制)。
          name: 'GeneralRateLimit',
          priority: 4,
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
              evaluationWindowSec: 300,
            },
          },
          action: { block: {} },
          visibilityConfig: visibility('GeneralRateLimit'),
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAclArn,
      description: 'Unified CloudFront WebACL ARN (us-east-1)',
    });
  }
}
