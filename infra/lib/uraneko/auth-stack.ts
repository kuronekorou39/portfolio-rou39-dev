import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import * as path from 'path';

// uraneko 用 Google OAuth クライアント ID(Google Cloud Console で作成)。
// SPA の Cognito Client ID と同様、ブラウザの認可リクエストに露出する公開値なので直書きする
// (.env 経由にすると CI デプロイ時に .env が無く PLACEHOLDER で上書きされる事故があるため)。
// Google 側の「承認済みのリダイレクト URI」には
//   https://uraneko-auth.rou39.com/oauth2/idpresponse
// を登録すること。クライアントシークレットは Secrets Manager
// (uraneko/google-oauth-client-secret)側で管理する。
const GOOGLE_CLIENT_ID = '84401600693-ubfslome5tarbuhokbk0017v9v29o4tj.apps.googleusercontent.com';

interface UranekoAuthStackProps extends cdk.StackProps {
  certificate: acm.ICertificate; // us-east-1 の rou39.com + *.rou39.com 証明書
  hostedZone: route53.IHostedZone;
  // 例: "uraneko-auth.rou39.com"。
  // auth.uraneko.rou39.com は *.rou39.com の対象外(2階層)なので使わないこと。
  authDomain: string;
  subdomain: string; // 例: "uraneko.rou39.com"(UranekoEmail で検証済みの SES ドメイン)
  fromEmail: string; // 例: "noreply@uraneko.rou39.com"
  googleClientSecret: secretsmanager.ISecret;
  localDevPort?: number; // frontend-uraneko の vite port (default 5174)
}

/**
 * uraneko 専用の Cognito UserPool。
 * 本家 portfolio-users とは会員基盤を完全分離する(uraneko の性質上、
 * 本家ポートフォリオのアカウントと購入履歴が紐付かないようにする)。
 */
export class UranekoAuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: UranekoAuthStackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'uraneko-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // 確認メール等を uraneko 名義で送る(本家プール共用時は "rou39 Portfolio" 名義で届いていた)
      email: cognito.UserPoolEmail.withSES({
        fromEmail: props.fromEmail,
        fromName: 'uraneko',
        sesRegion: 'ap-northeast-1',
        sesVerifiedDomain: props.subdomain,
      }),
    });

    // Google ログインと email/password アカウントの自動リンク(本家と同じハンドラを共用)
    const preSignUpFn = new nodejs.NodejsFunction(this, 'PreSignUpFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../../backend/src/handlers/pre-signup.ts'),
      handler: 'handler',
      bundling: { externalModules: ['@aws-sdk/*'] },
    });
    // 本家 AuthStack の userpool/* と違い、自プールの ARN に限定する。
    // addToRolePolicy(Role の DefaultPolicy)だと Function → DefaultPolicy → UserPool →
    // Function の循環依存になるため、Role 配下に置かないスタンドアロン Policy として付与する。
    new iam.Policy(this, 'PreSignUpPoolPolicy', {
      roles: [preSignUpFn.role!],
      statements: [
        new iam.PolicyStatement({
          actions: [
            'cognito-idp:ListUsers',
            'cognito-idp:AdminLinkProviderForUser',
          ],
          resources: [this.userPool.userPoolArn],
        }),
      ],
    });
    this.userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpFn);

    // Cognito カスタムドメイン(OAuth の authorize/token エンドポイント)
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
    // 平文を残さない(本家 auth-stack.ts の unsafePlainText 方式は使わない)。
    // 注意: 動的参照は「この IdP リソースにテンプレート差分が出る更新」の時にしか
    // 再解決されない。シークレット値だけ直して cdk deploy しても no-op で反映されないため、
    // 値を設定/ローテートしたら GOOGLE_CLIENT_ID 等の差分を伴わせて再デプロイすること
    // (初回は PLACEHOLDER → 実値の変更が差分になるので、シークレット設定 → クライアントID
    // 実値化 → デプロイ、の順なら正しく取り込まれる)。
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: GOOGLE_CLIENT_ID,
      clientSecretValue: props.googleClientSecret.secretValue,
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
      },
    });

    const port = props.localDevPort ?? 5174;
    this.userPoolClient = new cognito.UserPoolClient(this, 'UranekoWebClient', {
      userPool: this.userPool,
      userPoolClientName: 'uraneko-web-client',
      authFlows: {
        userSrp: true,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
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

    new cdk.CfnOutput(this, 'UranekoUserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UranekoUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'UranekoCognitoDomainUrl', {
      value: `https://${props.authDomain}`,
    });
  }
}
