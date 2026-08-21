import * as lambda from 'aws-cdk-lib/aws-lambda';

/**
 * 全 Lambda 共通のランタイム。
 * バージョンアップ時はここだけ変える(NodejsFunction の esbuild target もこれに追随する)。
 * 非推奨スケジュールは AWS の「Lambda ランタイム」ドキュメントを参照。
 */
export const LAMBDA_RUNTIME = lambda.Runtime.NODEJS_24_X;
