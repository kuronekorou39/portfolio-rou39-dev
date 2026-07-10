import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export class UranekoSecretsStack extends cdk.Stack {
  public readonly nowpaymentsApiKey: secretsmanager.Secret;
  public readonly nowpaymentsIpnSecret: secretsmanager.Secret;
  public readonly orderAccessSecret: secretsmanager.Secret;
  public readonly googleOAuthClientSecret: secretsmanager.Secret;

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

    // uraneko 用 Google OAuth クライアントシークレット。
    // UranekoAuthStack の Google IdP が CloudFormation の動的参照で読む。
    // 動的参照はデプロイ時に解決されるため、UranekoAuth をデプロイする前に
    // コンソール/CLI で実値を設定しておくこと(未設定だと自動生成のランダム値が焼き込まれる)。
    this.googleOAuthClientSecret = new secretsmanager.Secret(this, 'GoogleOAuthClientSecret', {
      secretName: 'uraneko/google-oauth-client-secret',
      description: 'Google OAuth client secret for uraneko Cognito Google IdP (set real value BEFORE deploying UranekoAuth)',
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
