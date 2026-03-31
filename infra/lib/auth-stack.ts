import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'portfolio-users',
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
      email: cognito.UserPoolEmail.withSES({
        fromEmail: 'noreply@rou39.dev',
        fromName: 'rou39 Portfolio',
        sesRegion: 'ap-northeast-1',
      }),
    });

    // Cognito Domain (Hosted UI用)
    const domain = this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: 'rou39-portfolio',
      },
    });

    // Google Identity Provider
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER',
      clientSecretValue: cdk.SecretValue.unsafePlainText(
        process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
      ),
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        nickname: cognito.ProviderAttribute.GOOGLE_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: 'portfolio-web-client',
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
          'http://localhost:5173/auth/callback',
          'https://d1ahc0yyinui33.cloudfront.net/auth/callback',
        ],
        logoutUrls: [
          'http://localhost:5173/',
          'https://d1ahc0yyinui33.cloudfront.net/',
        ],
      },
    });
    this.userPoolClient.node.addDependency(googleProvider);

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'CognitoDomainUrl', {
      value: `https://${domain.domainName}.auth.ap-northeast-1.amazoncognito.com`,
    });
  }
}
