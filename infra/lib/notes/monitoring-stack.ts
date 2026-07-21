import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwactions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type { Construct } from 'constructs';

interface NotesMonitoringStackProps extends cdk.StackProps {
  alertEmail: string;
  /** 未認証の公開 Lambda(エラー/スロットル/連射の監視対象)。 */
  getMemoFn: lambda.Function;
  saveTabFn: lambda.Function;
  flushFn: lambda.Function;
  /** 管理系の代表(発行)。 */
  issueMemoFn: lambda.Function;
  /** 読み取りコスト暴走(満杯メモの /m/get 連射)を直接検知するための対象テーブル。 */
  memosTable: dynamodb.ITable;
  tabsTable: dynamodb.ITable;
}

/**
 * notes の運用アラーム。無料公開サービスとして「濫用・コスト暴走・障害」を
 * メールで検知する。アカウント全体の予算アラートは base の MonitoringStack が
 * 持っているため、ここではサービス固有のシグナルに絞る:
 *  - Lambda エラー(5xx)
 *  - Lambda スロットル(予約同時実行の枯渇 = 濫用 or 過負荷のサイン)
 *  - save-tab の invocation スパイク(per-token 制限で 429 になっても invoke 自体は
 *    課金されるため、連射攻撃のコストシグナルとして拾う)
 */
export class NotesMonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: NotesMonitoringStackProps) {
    super(scope, id, props);

    this.alertTopic = new sns.Topic(this, 'NotesAlertTopic', {
      topicName: 'notes-alerts',
      displayName: 'notes alerts',
    });
    this.alertTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
    const action = new cwactions.SnsAction(this.alertTopic);

    const fns = [
      ['GetMemo', props.getMemoFn],
      ['SaveTab', props.saveTabFn],
      ['Flush', props.flushFn],
      ['IssueMemo', props.issueMemoFn],
    ] as const;

    // Lambda エラー(バグ or 異常入力の兆候)
    for (const [name, fn] of fns) {
      const alarm = new cloudwatch.Alarm(this, `${name}ErrorsAlarm`, {
        alarmName: `notes-${name.toLowerCase()}-errors`,
        alarmDescription: `notes: ${name} Lambda がエラーを返している`,
        metric: fn.metricErrors({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
    }

    // 公開 Lambda のスロットル(予約同時実行の枯渇=濫用/過負荷)
    for (const [name, fn] of [
      ['GetMemo', props.getMemoFn],
      ['SaveTab', props.saveTabFn],
    ] as const) {
      const alarm = new cloudwatch.Alarm(this, `${name}ThrottlesAlarm`, {
        alarmName: `notes-${name.toLowerCase()}-throttled`,
        alarmDescription:
          `notes: ${name} Lambda が同時実行上限でスロットルされている(濫用または過負荷)`,
        metric: fn.metricThrottles({ period: cdk.Duration.minutes(5), statistic: 'Sum' }),
        threshold: 10,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
    }

    // save-tab の連射(429 でも invoke は課金されるため、コスト暴走のトリップワイヤ)。
    // 正当利用の上限は per-token 1回/秒 ≈ 300/5分。複数メモの併用を見込んでも
    // 2000/5分 を超えたら連射スクリプトの可能性が高い。
    const spikeAlarm = new cloudwatch.Alarm(this, 'SaveTabSpikeAlarm', {
      alarmName: 'notes-savetab-invocation-spike',
      alarmDescription:
        'notes: save-tab の呼び出しが急増(連射攻撃の疑い。コスト暴走前に確認する)',
      metric: props.saveTabFn.metricInvocations({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 2000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    spikeAlarm.addAlarmAction(action);

    // get-memo(読み取り)の連射。公開エンドポイント中で最も高コスト(満杯メモで tabs Query が
    // 大きい)なのに per-token スロットルが無いため、独立の速報アラームを張る。API Gateway の
    // ステージ既定スロットル(50rps=約15,000/5分)が上限なので、その手前 10,000/5分 で拾う。
    const getSpikeAlarm = new cloudwatch.Alarm(this, 'GetMemoSpikeAlarm', {
      alarmName: 'notes-getmemo-invocation-spike',
      alarmDescription:
        'notes: get-memo(読み取り)の呼び出しが急増(共有/漏洩URLの連射によるコスト暴走の疑い)',
      metric: props.getMemoFn.metricInvocations({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum',
      }),
      threshold: 10000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    getSpikeAlarm.addAlarmAction(action);

    // 読み取り消費容量(memos + tabs)の急増を直接検知。満杯メモ1回の /m/get は概算90 RRU で、
    // 連射されると invocation 数より先に DynamoDB オンデマンド課金が膨らむ。月次予算(最大〜24h
    // 遅延)より早く日次で気づくためのコスト背骨。閾値 100,000 RRU/5分 ≒ 333 RRU/s は、
    // 単一ユーザーの無料メモサービスとしては明確に異常な水準。
    const readCapacity = new cloudwatch.MathExpression({
      expression: 'memos + tabs',
      usingMetrics: {
        memos: props.memosTable.metricConsumedReadCapacityUnits({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
        tabs: props.tabsTable.metricConsumedReadCapacityUnits({
          period: cdk.Duration.minutes(5),
          statistic: 'Sum',
        }),
      },
      period: cdk.Duration.minutes(5),
    });
    const readCostAlarm = new cloudwatch.Alarm(this, 'ReadCapacitySpikeAlarm', {
      alarmName: 'notes-read-capacity-spike',
      alarmDescription:
        'notes: memos/tabs の読み取り消費容量が急増(満杯メモの /m/get 連射などコスト暴走の疑い)',
      metric: readCapacity,
      threshold: 100000,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    readCostAlarm.addAlarmAction(action);

    new cdk.CfnOutput(this, 'NotesAlertTopicArn', { value: this.alertTopic.topicArn });
  }
}
