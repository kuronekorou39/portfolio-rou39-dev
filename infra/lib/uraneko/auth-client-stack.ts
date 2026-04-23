import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

interface UranekoAuthClientStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  subdomain: string; // "uraneko.rou39.com"
  localDevPort?: number; // frontend-uraneko の vite port (default 5174)
}

export class UranekoAuthClientStack extends cdk.Stack {
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: UranekoAuthClientStackProps) {
    super(scope, id, props);

    const port = props.localDevPort ?? 5174;

    this.userPoolClient = new cognito.UserPoolClient(this, 'UranekoWebClient', {
      userPool: props.userPool,
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

    new cdk.CfnOutput(this, 'UranekoUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
  }
}
