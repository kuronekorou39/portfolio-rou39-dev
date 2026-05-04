import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const alertEmail = process.env.ALERT_EMAIL || 'alert@example.com';

    // 月予算 $200 (≒3万円)。 relations の「大量」プラン (329MB)
    // を CloudFront 経由で配信するため、転送量超過の早期検知用に
    // 25%/50%/100%/120% の 4 段階で通知する。
    // 100% 到達時はインフラ側で配信停止判断 (大量プランを localOnly に戻す等)。
    const thresholds = [
      { pct: 25,  label: 'INFO'   },  // $50 ≒ 7,500円。 注意
      { pct: 50,  label: 'WARN'   },  // $100 ≒ 15,000円。 警告
      { pct: 100, label: 'DANGER' },  // $200 ≒ 30,000円。 上限到達
      { pct: 120, label: 'OVER'   },  // $240 ≒ 36,000円。 超過(放置=想定外)
    ];
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'portfolio-monthly-budget',
        budgetLimit: { amount: 200, unit: 'USD' },
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: thresholds.map(t => ({
        notification: {
          comparisonOperator: 'GREATER_THAN',
          notificationType: 'ACTUAL',
          threshold: t.pct,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [{ subscriptionType: 'EMAIL', address: alertEmail }],
      })),
    });

    new cdk.CfnOutput(this, 'BudgetAlertEmail', {
      value: alertEmail,
      description: 'Email address for budget alerts',
    });
  }
}
