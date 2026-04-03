import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import type { Construct } from 'constructs';

export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const alertEmail = process.env.ALERT_EMAIL || 'alert@example.com';

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'portfolio-monthly-budget',
        budgetLimit: { amount: 10, unit: 'USD' },
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
      },
      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: 'GREATER_THAN',
            notificationType: 'ACTUAL',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: alertEmail,
            },
          ],
        },
      ],
    });

    new cdk.CfnOutput(this, 'BudgetAlertEmail', {
      value: alertEmail,
      description: 'Email address for budget alerts',
    });
  }
}
