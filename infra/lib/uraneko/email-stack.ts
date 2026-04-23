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

    const identity = new ses.EmailIdentity(this, 'UranekoEmailIdentity', {
      identity: ses.Identity.domain(props.subdomain),
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
