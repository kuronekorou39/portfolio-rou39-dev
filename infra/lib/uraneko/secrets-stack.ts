import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export class UranekoSecretsStack extends cdk.Stack {
  public readonly nowpaymentsApiKey: secretsmanager.Secret;
  public readonly nowpaymentsIpnSecret: secretsmanager.Secret;
  public readonly orderAccessSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.nowpaymentsApiKey = new secretsmanager.Secret(this, 'NowpaymentsApiKey', {
      secretName: 'uraneko/nowpayments/api-key',
      description: 'NOWPayments API key (set via AWS Console after deploy)',
    });

    this.nowpaymentsIpnSecret = new secretsmanager.Secret(this, 'NowpaymentsIpnSecret', {
      secretName: 'uraneko/nowpayments/ipn-secret',
      description: 'NOWPayments IPN secret for webhook HMAC verification (set via AWS Console after deploy)',
    });

    // ゲスト購入者向けの注文アクセストークン用 HMAC シークレット(CDK で自動生成)
    this.orderAccessSecret = new secretsmanager.Secret(this, 'OrderAccessSecret', {
      secretName: 'uraneko/order-access-secret',
      description: 'HMAC secret for signing guest order access tokens',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
  }
}
