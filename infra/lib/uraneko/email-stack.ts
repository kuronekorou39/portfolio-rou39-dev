import * as cdk from 'aws-cdk-lib';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type { Construct } from 'constructs';

interface UranekoEmailStackProps extends cdk.StackProps {
  hostedZone: route53.IHostedZone;
  subdomain: string; // 例: "uraneko.rou39.com"
}

export class UranekoEmailStack extends cdk.Stack {
  public readonly identityName: string;
  public readonly fromAddress: string;

  constructor(scope: Construct, id: string, props: UranekoEmailStackProps) {
    super(scope, id, props);

    // カスタム MAIL FROM(envelope-from)。SPF を送信ドメイン側に揃える(SPF アライメント)。
    // MX 検証未完了時は既定(*.amazonses.com)へフォールバックさせ、送信が止まらないようにする。
    const mailFromDomain = `mail.${props.subdomain}`; // mail.uraneko.rou39.com

    const identity = new ses.EmailIdentity(this, 'UranekoEmailIdentity', {
      identity: ses.Identity.domain(props.subdomain),
      mailFromDomain,
      mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
    });

    // カスタム MAIL FROM が要求する DNS: バウンス受信の MX と SPF(TXT)。
    new route53.MxRecord(this, 'MailFromMx', {
      zone: props.hostedZone,
      recordName: `${mailFromDomain}.`,
      values: [{ priority: 10, hostName: `feedback-smtp.${this.region}.amazonses.com` }],
    });
    new route53.TxtRecord(this, 'MailFromSpf', {
      zone: props.hostedZone,
      recordName: `${mailFromDomain}.`,
      values: ['v=spf1 include:amazonses.com ~all'],
    });

    // DMARC: DKIM/SPF アライメント済みメールを DMARC 準拠にする(Gmail/Yahoo 2024 送信者要件)。
    // まずは監視のみの p=none で開始し、集計レポートは rou39.com 側(転送設定)へ送る。
    new route53.TxtRecord(this, 'DmarcRecord', {
      zone: props.hostedZone,
      recordName: `_dmarc.${props.subdomain}.`,
      values: ['v=DMARC1; p=none; rua=mailto:dmarc@rou39.com'],
    });

    // DKIM CNAME x3 を親 hosted zone (rou39.com) に登録する。
    // dkimDnsTokenName は "xxx._domainkey.uraneko.rou39.com" の FQDN で返るので、
    // 末尾に "." を付けて fully qualified name として扱わせる(zoneName の重複追加を回避)。
    const dkimTokens = [
      { name: identity.dkimDnsTokenName1, value: identity.dkimDnsTokenValue1 },
      { name: identity.dkimDnsTokenName2, value: identity.dkimDnsTokenValue2 },
      { name: identity.dkimDnsTokenName3, value: identity.dkimDnsTokenValue3 },
    ];
    dkimTokens.forEach((t, i) => {
      new route53.CnameRecord(this, `DkimRecord${i + 1}`, {
        zone: props.hostedZone,
        recordName: `${t.name}.`,
        domainName: t.value,
      });
    });

    this.identityName = props.subdomain;
    this.fromAddress = `noreply@${props.subdomain}`;

    new cdk.CfnOutput(this, 'FromAddress', { value: this.fromAddress });
  }
}
