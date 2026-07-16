import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

export class NotesSecretsStack extends cdk.Stack {
  public readonly googleOAuthClientSecret: secretsmanager.Secret;
  public readonly ipHashSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // notes 用 Google OAuth クライアントシークレット(uraneko とは別の GCP プロジェクト)。
    // NotesAuthStack の Google IdP が CloudFormation の動的参照で読む。動的参照はデプロイ時に
    // 解決されるため、NotesAuth をデプロイする前にコンソール/CLI で実値を設定しておくこと
    // (未設定だと自動生成のランダム値が焼き込まれ、Google ログインが通らない)。
    this.googleOAuthClientSecret = new secretsmanager.Secret(this, 'GoogleOAuthClientSecret', {
      secretName: 'notes/google-oauth-client-secret',
      description: 'Google OAuth client secret for notes Cognito Google IdP (set real value BEFORE deploying NotesAuth)',
    });

    // アクセスログの ip_hash 用ベース鍵(CDK で自動生成)。
    //
    // 生IPは保存せず HMAC で秘匿するが、素の SHA-256(ip) は IPv4 の 2^32 空間を総当たりできて
    // しまうため鍵付きにする。さらに「日次ローテート」を Secrets のローテーション機構なしで
    // 満たすため、実際の salt はコード側で日付から導出する:
    //   dailySalt = HMAC(baseKey, 'YYYY-MM-DD') ; ip_hash = HMAC(dailySalt, ip)
    // これで日をまたぐと過去ログのIPを逆引き照合できなくなる(同日内の相関は許容・仕様)。
    this.ipHashSecret = new secretsmanager.Secret(this, 'IpHashSecret', {
      secretName: 'notes/ip-hash-secret',
      description: 'Base key for deriving the daily salt used to HMAC access-log IPs',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });
  }
}
