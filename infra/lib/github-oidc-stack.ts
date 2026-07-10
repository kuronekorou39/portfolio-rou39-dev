import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

// CI(GitHub Actions)が AssumeRole できる対象リポジトリ。
// main ブランチの push ワークフローだけに限定する(PR や fork からは不可)。
const GITHUB_REPO = 'kuronekorou39/portfolio-rou39-dev';

/**
 * GitHub Actions の OIDC 連携。
 * 長期アクセスキー(IAM ユーザー portfolio-deployer)を廃止し、
 * ワークフロー実行時だけ有効な短命クレデンシャルに置き換える。
 *
 * 権限は「CDK bootstrap ロール群への AssumeRole」+「seed ステップの
 * DynamoDB PutItem」のみ。実際のリソース操作権限は cdk-* ロール側にあり、
 * このロール自体には持たせない。
 */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new iam.Role(this, 'DeployRole', {
      // deploy.yml の role-to-assume が参照する固定名
      roleName: 'github-actions-deploy',
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:refs/heads/main`,
        },
      }),
      description: 'GitHub Actions (main push) deploy: assume cdk-* roles + seed PutItem',
    });

    // cdk deploy は bootstrap 済みの cdk-* ロール(deploy/file-publishing/
    // image-publishing/lookup)に AssumeRole して実行される
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    // deploy.yml の seed ステップ(scripts/seed/seed-projects.mjs)用
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:PutItem'],
        resources: [
          `arn:aws:dynamodb:${this.region}:${this.account}:table/portfolio-projects`,
        ],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
