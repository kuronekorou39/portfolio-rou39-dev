import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

// notes 用 Google OAuth クライアント ID(notes 専用の GCP プロジェクトで作成)。
// SPA の Cognito Client ID と同様、ブラウザの認可リクエストに露出する公開値なので直書きする。
// Google 側の「承認済みのリダイレクト URI」には
//   https://notes-auth.rou39.com/oauth2/idpresponse
// を登録すること。クライアントシークレットは Secrets Manager
// (notes/google-oauth-client-secret)側で管理する。
const GOOGLE_CLIENT_ID = '967103054792-4t1r1sdapstsactr0p8sstr0chgkcb7s.apps.googleusercontent.com';

interface NotesAuthStackProps extends cdk.StackProps {
  certificate: acm.ICertificate; // us-east-1 の rou39.com + *.rou39.com 証明書
  hostedZone: route53.IHostedZone;
  // 例: "notes-auth.rou39.com"。
  // auth.notes.rou39.com は *.rou39.com の対象外(2階層)なので使わないこと。
  authDomain: string;
  subdomain: string; // 例: "notes.rou39.com"
  googleClientSecret: secretsmanager.ISecret;
  localDevPort?: number; // frontend-notes の vite port (default 5175)
}

/**
 * notes 専用の Cognito UserPool。本家/uraneko とは会員基盤を完全分離する
 * (サブドメインごとにプールを分ける方針)。
 *
 * uraneko との違い(Google 連携のみ、の決定による簡素化):
 * - email/password のネイティブ登録なし → selfSignUpEnabled: false、SRP フロー無効。
 * - Cognito がメールを送る場面がない → SES 設定(UserPoolEmail.withSES)と
 *   NotesEmail スタック自体が不要。
 * - pre-signup トリガー(Google とネイティブアカウントの自動リンク)も不要。
 *   リンク対象のネイティブアカウントがそもそも存在しないため。
 */
export class NotesAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: NotesAuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'notes-users',
      selfSignUpEnabled: false, // ネイティブ登録は閉じる(Google 連携経由のみ)
      signInAliases: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Cognito カスタムドメイン(OAuth の authorize/token エンドポイント)。
    // デフォルトドメインでないのは、ブランド確認未通過のアプリは Google ログイン画面に
    // リダイレクト URI の eTLD+1 が表示されるため(カスタムなら rou39.com、
    // デフォルトだと amazoncognito.com と出て第三者に不信感を与える)。
    const domain = this.userPool.addDomain('CustomDomain', {
      customDomain: {
        domainName: props.authDomain,
        certificate: props.certificate,
      },
    });

    new route53.ARecord(this, 'AuthDomainARecord', {
      zone: props.hostedZone,
      recordName: props.authDomain,
      target: route53.RecordTarget.fromAlias(new route53targets.UserPoolDomainTarget(domain)),
    });

    // Google Identity Provider。
    // シークレットは Secrets Manager の動的参照で渡し、CloudFormation テンプレートに
    // 平文を残さない。
    // 注意: 動的参照は「この IdP リソースにテンプレート差分が出る更新」の時にしか
    // 再解決されない。必ず notes/google-oauth-client-secret に実値を設定してから
    // この スタックを初回デプロイすること(未設定だと CDK 自動生成のランダム値が焼き込まれる)。
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: GOOGLE_CLIENT_ID,
      clientSecretValue: props.googleClientSecret.secretValue,
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
      },
    });

    const port = props.localDevPort ?? 5175;
    this.userPoolClient = new cognito.UserPoolClient(this, 'NotesWebClient', {
      userPool: this.userPool,
      userPoolClientName: 'notes-web-client',
      // Google 連携のみ(COGNITO を含めない=hosted UI がネイティブログインを出さない)
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.GOOGLE],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [
          `http://localhost:${port}/auth/callback`,
          `https://${props.subdomain}/auth/callback`,
        ],
        logoutUrls: [
          `http://localhost:${port}/`,
          `https://${props.subdomain}/`,
        ],
      },
    });
    this.userPoolClient.node.addDependency(googleProvider);

    new cdk.CfnOutput(this, 'NotesUserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'NotesUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'NotesCognitoDomainUrl', {
      value: `https://${props.authDomain}`,
    });
  }
}
