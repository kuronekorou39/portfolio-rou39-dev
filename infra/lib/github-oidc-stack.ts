import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

// CI(GitHub Actions)が AssumeRole できる対象リポジトリ。
// main ブランチの push ワークフローだけに限定する(PR や fork からは不可)。
const GITHUB_REPO = 'kuronekorou39/portfolio-rou39-dev';

// 「中身だけ」の経路が触れる範囲。deploy.yml の SITE_BUCKET / SITE_DISTRIBUTION_ID / 同期先と揃えること。
// 配信 ID は rou39.com の CloudFront(FrontendStack)。作り直すと変わる
const SITE_BUCKET = 'rou39-site';
const SITE_DISTRIBUTION_ID = 'E2MX55DRRVJ7XR';
const CONTENT_PREFIXES = ['content/devlog', 'devlog', 'projects'];

/**
 * GitHub Actions の OIDC 連携。
 * 長期アクセスキー(IAM ユーザー portfolio-deployer)を廃止し、
 * ワークフロー実行時だけ有効な短命クレデンシャルに置き換える。
 *
 * 権限は「CDK bootstrap ロール群への AssumeRole」+「seed ステップの
 * DynamoDB PutItem」+「中身だけの経路の S3 同期と invalidate(置き場所を限定)」。
 * それ以外のリソース操作権限は cdk-* ロール側にあり、このロール自体には持たせない。
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

    // deploy.yml の「中身だけ」の経路用。ログ・アプリの画像を CDK を通さずに S3 へ同期し、
    // その配信パスだけ invalidate する。書ける場所は中身の置き場所に限る(index.html や JS は書けない)。
    // uraneko / notes のバケットと配信には一切触れない
    const siteBucketArn = `arn:aws:s3:::${SITE_BUCKET}`;
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:ListBucket'],
        resources: [siteBucketArn],
        conditions: { StringLike: { 's3:prefix': CONTENT_PREFIXES.flatMap((p) => [p, `${p}/*`]) } },
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutObject', 's3:DeleteObject'],
        resources: CONTENT_PREFIXES.map((p) => `${siteBucketArn}/${p}/*`),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation'],
        resources: [`arn:aws:cloudfront::${this.account}:distribution/${SITE_DISTRIBUTION_ID}`],
      }),
    );

    new cdk.CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
