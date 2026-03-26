/**
 * Usage: npx tsx scripts/seed-project.ts
 *
 * DynamoDBにプロダクトデータを登録するスクリプト。
 * AWS認証情報が設定されている環境で実行すること。
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: 'ap-northeast-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = 'portfolio-projects';

const projects = [
  {
    id: 'u2b-loop',
    title: 'U2B Loop',
    subtitle: 'YouTube動画の区間リピートツール',
    description: '# U2B Loop\n\nYouTube動画の特定区間をリピート再生できるWebアプリケーション。',
    howToUse: '## 使い方\n\n1. YouTube URLを入力\n2. 開始・終了時間を設定\n3. ループ再生ボタンを押す',
    category: 'web',
    tags: ['React', 'TypeScript', 'YouTube API'],
    platform: ['Web'],
    icon: '',
    screenshots: [],
    links: { web: '#', github: '#' },
    status: 'active',
    publishedAt: '2025-01-01',
    updatedAt: '2025-01-01',
  },
  {
    id: 'koko-meshi',
    title: 'Koko-Meshi',
    subtitle: '近くの飯屋をサッと探す',
    description: '# Koko-Meshi\n\n現在地周辺の飲食店を素早く検索できるモバイルアプリ。',
    howToUse: '## 使い方\n\n1. アプリを開く\n2. 位置情報を許可\n3. 近くのお店が表示される',
    category: 'mobile',
    tags: ['React Native', 'Firebase', 'Google Maps API'],
    platform: ['iOS', 'Android'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'active',
    publishedAt: '2025-03-01',
    updatedAt: '2025-03-01',
  },
  {
    id: 'domain-traffic-inspector',
    title: 'Domain Traffic Inspector',
    subtitle: 'ドメインのトラフィックを可視化',
    description: '# Domain Traffic Inspector\n\nブラウザのネットワーク通信をドメインごとに分類・可視化するChrome拡張機能。',
    howToUse: '## 使い方\n\n1. Chrome拡張機能をインストール\n2. 任意のWebサイトを開く\n3. 拡張機能アイコンをクリックしてトラフィックを確認',
    category: 'extension',
    tags: ['Chrome Extension', 'TypeScript', 'Chart.js'],
    platform: ['Chrome'],
    icon: '',
    screenshots: [],
    links: {},
    status: 'active',
    publishedAt: '2025-06-01',
    updatedAt: '2025-06-01',
  },
];

async function seed() {
  for (const project of projects) {
    await docClient.send(
      new PutCommand({ TableName: TABLE, Item: project })
    );
    console.log(`Registered: ${project.title}`);
  }
  console.log('Done!');
}

seed().catch(console.error);
