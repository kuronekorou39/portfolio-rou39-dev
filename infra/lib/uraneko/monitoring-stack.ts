import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';

interface UranekoMonitoringStackProps extends cdk.StackProps {
  alertEmail: string;
}

/**
 * Phase A では SNS Topic だけ用意する。
 * トークン枯渇アラームの Lambda + CloudWatch Alarm は商品登録後(Phase B)に有効化。
 */
export class UranekoMonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: UranekoMonitoringStackProps) {
    super(scope, id, props);

    this.alertTopic = new sns.Topic(this, 'UranekoAlertTopic', {
      topicName: 'uraneko-alerts',
      displayName: 'uraneko alerts',
    });

    this.alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));

    new cdk.CfnOutput(this, 'UranekoAlertTopicArn', { value: this.alertTopic.topicArn });
  }
}
