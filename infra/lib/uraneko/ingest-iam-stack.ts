import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

interface UranekoIngestIamStackProps extends cdk.StackProps {
  assetsBucket: s3.IBucket;
  tokensTable: dynamodb.ITable;
}

/**
 * ghost-code プロジェクト(自宅 GPU マシン)から uraneko-assets S3 と
 * uraneko-video-tokens DDB にのみ書き込める IAM User。
 *
 * AccessKey の発行は IAM コンソールで手動で行うこと(CFN Output に平文を出さないため)。
 * 仕様詳細は data/uraneko-ingest-contract.md を参照。
 */
export class UranekoIngestIamStack extends cdk.Stack {
  public readonly ingestUser: iam.User;

  constructor(scope: Construct, id: string, props: UranekoIngestIamStackProps) {
    super(scope, id, props);

    this.ingestUser = new iam.User(this, 'IngestUser', {
      userName: 'uraneko-ghost-code-ingest',
    });

    this.ingestUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:AbortMultipartUpload'],
        resources: [`${props.assetsBucket.bucketArn}/videos/*`],
      }),
    );

    this.ingestUser.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [props.tokensTable.tableArn],
      }),
    );

    new cdk.CfnOutput(this, 'IngestUserName', { value: this.ingestUser.userName });
    new cdk.CfnOutput(this, 'IngestUserArn', { value: this.ingestUser.userArn });
    new cdk.CfnOutput(this, 'AccessKeyNote', {
      value: 'Create AccessKey manually via IAM Console → Security credentials',
    });
  }
}
