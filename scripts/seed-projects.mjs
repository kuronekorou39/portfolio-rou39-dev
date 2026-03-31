/**
 * DynamoDB にプロジェクトデータを投入するシードスクリプト
 *
 * Usage: node scripts/seed-projects.mjs
 *
 * 前提:
 *   - テーブル `portfolio-projects` が ap-northeast-1 に作成済み
 *   - AWS CLI / 環境変数で認証済み
 *   - backend/ に @aws-sdk/client-dynamodb, @aws-sdk/lib-dynamodb がインストール済み
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(
  new URL('../backend/', import.meta.url).href
);

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'portfolio-projects';
const REGION = 'ap-northeast-1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projects = JSON.parse(
  readFileSync(join(__dirname, '../data/projects.json'), 'utf-8')
);

async function main() {
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log(`Seeding ${projects.length} projects into "${TABLE_NAME}" (${REGION})...\n`);

  for (const project of projects) {
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: project,
        })
      );
      console.log(`  [OK] ${project.id} — ${project.title}`);
    } catch (err) {
      console.error(`  [FAIL] ${project.id} — ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log('\nDone.');
}

main();
