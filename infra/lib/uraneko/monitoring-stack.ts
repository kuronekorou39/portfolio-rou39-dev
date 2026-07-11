import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwactions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { Construct } from 'constructs';

interface UranekoMonitoringStackProps extends cdk.StackProps {
  alertEmail: string;
  checkoutFn: lambda.Function;
  webhookFn: lambda.Function;
}

/**
 * 運用アラーム。支払い済みなのにフルフィル失敗(在庫枯渇等)を検知して通知する。
 * webhook は失敗時に console.error('FULFILL FAILED ...') を出して 200 を返す
 * (NOWPayments の無限再送を止める)ため、ログのメトリクスフィルタで拾う。
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
    const action = new cwactions.SnsAction(this.alertTopic);

    // 支払い済み・フルフィル失敗(手動対応=返金/在庫補充が必要)
    const fulfillFail = new logs.MetricFilter(this, 'FulfillFailFilter', {
      logGroup: props.webhookFn.logGroup,
      metricNamespace: 'uraneko',
      metricName: 'FulfillFailed',
      filterPattern: logs.FilterPattern.literal('"FULFILL FAILED"'),
      metricValue: '1',
      defaultValue: 0,
    });
    const fulfillAlarm = new cloudwatch.Alarm(this, 'FulfillFailAlarm', {
      alarmName: 'uraneko-fulfill-failed',
      alarmDescription:
        '支払い済みなのにフルフィル失敗(在庫枯渇等)。返金/在庫補充の手動対応が必要。',
      metric: fulfillFail.metric({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    fulfillAlarm.addAlarmAction(action);

    // 決済アノマリー: 支払額不足(underpaid)/ 先行受け渡し後の失敗・期限切れ。
    // いずれも自動処理せず管理者が購入者と個別対応するケース(webhook が
    // console.error('PAYMENT ANOMALY ...') を出す)。
    const paymentAnomaly = new logs.MetricFilter(this, 'PaymentAnomalyFilter', {
      logGroup: props.webhookFn.logGroup,
      metricNamespace: 'uraneko',
      metricName: 'PaymentAnomaly',
      filterPattern: logs.FilterPattern.literal('"PAYMENT ANOMALY"'),
      metricValue: '1',
      defaultValue: 0,
    });
    const paymentAnomalyAlarm = new cloudwatch.Alarm(this, 'PaymentAnomalyAlarm', {
      alarmName: 'uraneko-payment-anomaly',
      alarmDescription:
        '支払額不足、または先行受け渡し後の決済失敗/期限切れ。購入者との個別対応が必要。',
      metric: paymentAnomaly.metric({ statistic: 'Sum', period: cdk.Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    paymentAnomalyAlarm.addAlarmAction(action);

    // checkout / webhook の Lambda エラー(500 等)
    for (const [name, fn] of [
      ['Checkout', props.checkoutFn],
      ['Webhook', props.webhookFn],
    ] as const) {
      const alarm = new cloudwatch.Alarm(this, `${name}ErrorsAlarm`, {
        alarmName: `uraneko-${name.toLowerCase()}-errors`,
        alarmDescription: `${name} Lambda がエラーを返している`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
    }

    new cdk.CfnOutput(this, 'UranekoAlertTopicArn', { value: this.alertTopic.topicArn });
  }
}
