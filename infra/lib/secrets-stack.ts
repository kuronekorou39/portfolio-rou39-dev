import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

/**
 * 本家ポートフォリオ用の秘密情報(uraneko の UranekoSecretsStack と同方式)。
 * 値は CFN テンプレートに載せず、Lambda はシークレット名だけを env で受けて実行時取得、
 * Cognito IdP は CloudFormation の動的参照で読む。
 * 実値はデプロイ後にコンソール/CLI で設定する。
 */
export class PortfolioSecretsStack extends cdk.Stack {
  public readonly githubToken: secretsmanager.Secret;
  public readonly googleOAuthClientSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // GitHub 草グラフ取得用 PAT(contributions Lambda が実行時取得)
    this.githubToken = new secretsmanager.Secret(this, 'GithubToken', {
      secretName: 'portfolio/github-token',
      description: 'GitHub PAT for contributions graph (set via AWS Console after deploy)',
    });

    // 本家 Cognito Google IdP 用クライアントシークレット。
    // 動的参照はデプロイ時に解決されるため、PortfolioAuth をデプロイする前に実値を設定すること
    // (値のみ更新した場合は IdP リソースにテンプレート差分が出る更新を伴わせないと反映されない)。
    this.googleOAuthClientSecret = new secretsmanager.Secret(this, 'GoogleOAuthClientSecret', {
      secretName: 'portfolio/google-oauth-client-secret',
      description: 'Google OAuth client secret for portfolio Cognito Google IdP (set real value BEFORE deploying PortfolioAuth)',
    });
  }
}
