import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';
import * as path from 'path';
import { LAMBDA_RUNTIME } from './lambda-runtime';

interface MailStackProps extends cdk.StackProps {
  /** rou39.com */
  domainName: string;
  /** kuronekorou39@gmail.com 等の転送先 (SES sandbox 中は verified identity 必須) */
  forwardTo: string;
  /** 例: forward@rou39.com (rou39.com domain identity 配下、 verified) */
  fromAddress: string;
  /** Route 53 hosted zone (MX レコード追加用) */
  hostedZone: route53.IHostedZone;
}

/**
 * rou39.com 宛のメール受信を SES で受け取り、 Lambda 経由で Gmail に転送する。
 *
 * SES Email Receiving は対応リージョンが限定的 (us-east-1 / us-west-2 / eu-west-1)
 * のため、 このスタックは us-east-1 にデプロイする。 既存の rou39.com domain
 * identity (送信用) は ap-northeast-1 で verify されているので、 Lambda 内の
 * SES Client は ap-northeast-1 を明示的に指す。
 *
 * MX レコードは route53 hosted zone (グローバル) に登録するので、 リージョンに
 * よらず参照できる。
 */
export class MailStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MailStackProps) {
    super(scope, id, props);

    // 1. 受信メール原文を保存する S3 バケット (90日で自動削除)
    const archive = new s3.Bucket(this, 'MailArchive', {
      bucketName: 'rou39-mail-archive',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // SES が S3 へ書き込めるようにバケットポリシーを許可
    archive.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowSESPuts',
      principals: [new iam.ServicePrincipal('ses.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [archive.arnForObjects('*')],
      conditions: {
        StringEquals: { 'AWS:SourceAccount': cdk.Stack.of(this).account },
      },
    }));

    // 2. 転送 Lambda
    const forwarder = new nodejs.NodejsFunction(this, 'MailForwarder', {
      runtime: LAMBDA_RUNTIME,
      entry: path.join(__dirname, '../../backend/src/handlers/mail-forward.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        FORWARD_TO: props.forwardTo,
        FROM_ADDR: props.fromAddress,
        MAIL_BUCKET: archive.bucketName,
      },
      bundling: {
        // mailparser は重いので bundling で最適化(esbuild の target はランタイムに追随)
        minify: true,
        sourceMap: false,
      },
    });
    archive.grantRead(forwarder);
    // 送信は rou39.com identity に限定。identity は ap-northeast-1 で検証済みで、
    // mail-forward.ts の SES Client も ap-northeast-1 を明示している(このスタックの
    // us-east-1 ではない)ため、ARN のリージョンも ap-northeast-1 に固定する。
    forwarder.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendRawEmail', 'ses:SendEmail'],
      resources: [`arn:aws:ses:ap-northeast-1:${this.account}:identity/${props.domainName}`],
    }));

    // 3. SES Receipt Rule Set + catch-all rule
    const ruleSet = new ses.ReceiptRuleSet(this, 'MailRuleSet', {
      receiptRuleSetName: 'rou39-mail-ruleset',
    });
    ruleSet.addRule('CatchAll', {
      recipients: [props.domainName],   // rou39.com → *@rou39.com 全部受信
      enabled: true,
      scanEnabled: true,
      actions: [
        new sesActions.S3({ bucket: archive }),
        new sesActions.Lambda({ function: forwarder }),
      ],
    });

    // 4. Receipt Rule Set を active にする (CFN は activation を直接サポートしない)
    new AwsCustomResource(this, 'ActivateRuleSet', {
      onCreate: {
        service: 'SES',
        action: 'setActiveReceiptRuleSet',
        parameters: { RuleSetName: ruleSet.receiptRuleSetName },
        physicalResourceId: PhysicalResourceId.of('ActivateRuleSet'),
      },
      onDelete: {
        service: 'SES',
        action: 'setActiveReceiptRuleSet',
        parameters: {},   // 引数なしで deactivate
      },
      policy: AwsCustomResourcePolicy.fromSdkCalls({
        resources: AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    });

    // 5. MX レコード (Route 53)
    new route53.MxRecord(this, 'MailMxRecord', {
      zone: props.hostedZone,
      values: [{ priority: 10, hostName: 'inbound-smtp.us-east-1.amazonaws.com' }],
    });

    new cdk.CfnOutput(this, 'MailArchiveBucket', { value: archive.bucketName });
    new cdk.CfnOutput(this, 'ForwardTo', { value: props.forwardTo });
    new cdk.CfnOutput(this, 'FromAddress', { value: props.fromAddress });
  }
}
