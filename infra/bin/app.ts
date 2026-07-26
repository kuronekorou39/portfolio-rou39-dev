#!/usr/bin/env node
import 'source-map-support/register';
import { config } from 'dotenv';
config({ path: require('path').join(__dirname, '../../.env') });
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { StorageStack } from '../lib/storage-stack';
import { PortfolioSecretsStack } from '../lib/secrets-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { WafStack } from '../lib/waf-stack';
import { UnifiedWafStack } from '../lib/unified-waf-stack';
import { MailStack } from '../lib/mail-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { UranekoStorageStack } from '../lib/uraneko/storage-stack';
import { UranekoSecretsStack } from '../lib/uraneko/secrets-stack';
import { UranekoEmailStack } from '../lib/uraneko/email-stack';
import { UranekoAuthStack } from '../lib/uraneko/auth-stack';
import { UranekoIngestIamStack } from '../lib/uraneko/ingest-iam-stack';
import { UranekoApiStack } from '../lib/uraneko/api-stack';
import { UranekoWafStack } from '../lib/uraneko/waf-stack';
import { UranekoFrontendStack } from '../lib/uraneko/frontend-stack';
import { UranekoMonitoringStack } from '../lib/uraneko/monitoring-stack';
import { NotesStorageStack } from '../lib/notes/storage-stack';
import { NotesSecretsStack } from '../lib/notes/secrets-stack';
import { NotesAuthStack } from '../lib/notes/auth-stack';
import { NotesApiStack } from '../lib/notes/api-stack';
import { NotesFrontendStack } from '../lib/notes/frontend-stack';
import { NotesWafStack } from '../lib/notes/waf-stack';
import { NotesMonitoringStack } from '../lib/notes/monitoring-stack';

const app = new cdk.App();

const DOMAIN_NAME = 'rou39.com';
const AUTH_DOMAIN = `auth.${DOMAIN_NAME}`;
const URANEKO_SUBDOMAIN = `uraneko.${DOMAIN_NAME}`;
// uraneko 専用の Cognito 認証ドメイン。auth.uraneko.rou39.com は
// *.rou39.com ワイルドカード証明書の対象外(2階層)なので1階層に置く。
const URANEKO_AUTH_DOMAIN = `uraneko-auth.${DOMAIN_NAME}`;
const NOTES_SUBDOMAIN = `notes.${DOMAIN_NAME}`;
// notes 専用の Cognito 認証ドメイン(uraneko と同じく1階層必須)
const NOTES_AUTH_DOMAIN = `notes-auth.${DOMAIN_NAME}`;
const HOSTED_ZONE_ID = 'Z064847133X63Y56L8D3W';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

const storage = new StorageStack(app, 'PortfolioStorage', { env });
const portfolioSecrets = new PortfolioSecretsStack(app, 'PortfolioSecrets', { env });

// CI(GitHub Actions)用の OIDC 連携(長期アクセスキー廃止)
new GithubOidcStack(app, 'GithubOidc', { env });

// ACM certificate must be in us-east-1 for CloudFront and Cognito custom domain
const certStack = new cdk.Stack(app, 'PortfolioCert', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
});
const hostedZone = route53.HostedZone.fromHostedZoneAttributes(certStack, 'HostedZone', {
  hostedZoneId: HOSTED_ZONE_ID,
  zoneName: DOMAIN_NAME,
});
const certificate = new acm.Certificate(certStack, 'SiteCertificate', {
  domainName: DOMAIN_NAME,
  subjectAlternativeNames: [`*.${DOMAIN_NAME}`],
  validation: acm.CertificateValidation.fromDns(hostedZone),
});

// Auth stack with custom domain
const authHostedZone = route53.HostedZone.fromHostedZoneAttributes(
  app, 'AuthHostedZone', {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: DOMAIN_NAME,
  },
);
const auth = new AuthStack(app, 'PortfolioAuth', {
  env,
  crossRegionReferences: true,
  certificate,
  hostedZone: authHostedZone,
  authDomain: AUTH_DOMAIN,
  googleClientSecret: portfolioSecrets.googleOAuthClientSecret,
});

const api = new ApiStack(app, 'PortfolioApi', {
  env,
  projectsTable: storage.projectsTable,
  reviewsTable: storage.reviewsTable,
  pageViewsTable: storage.pageViewsTable,
  interestsTable: storage.interestsTable,
  commentsTable: storage.commentsTable,
  honeypotTable: storage.honeypotTable,
  gameScoresTable: storage.gameScoresTable,
  clipsTable: storage.clipsTable,
  contactsTable: storage.contactsTable,
  cacheTable: storage.cacheTable,
  assetsBucket: storage.assetsBucket,
  userPool: auth.userPool,
  githubTokenSecret: portfolioSecrets.githubToken,
});

// Frontend with custom domain
const frontendHostedZone = route53.HostedZone.fromHostedZoneAttributes(
  app, 'FrontendHostedZone', {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: DOMAIN_NAME,
  },
);

// 3サイト共通の CloudFront 用 WAFv2 WebACL は us-east-1 必須。
// WebACL / ルールは固定費 ($5 + $1/ルール) なので、サイトごとに分けず 1 つに統合して
// Host 条件で振り分ける。詳細は UnifiedWafStack の説明を参照。
const rou39Waf = new UnifiedWafStack(app, 'Rou39Waf', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
  domainName: DOMAIN_NAME,
  uranekoDomain: URANEKO_SUBDOMAIN,
  notesDomain: NOTES_SUBDOMAIN,
});

// [統合移行 Phase 1] 旧サイト別 WebACL。CloudFront の付け替えが全ディストリビューションに
// 伝播しきるまでは削除できない (関連付けが残っている WebACL は削除が失敗する)。
// 付け替え確認後、Phase 2 で cdk destroy して この宣言ごと消す。
new WafStack(app, 'PortfolioWaf', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
});

new FrontendStack(app, 'PortfolioFrontend', {
  env,
  crossRegionReferences: true,
  api: api.api,
  certificate,
  hostedZone: frontendHostedZone,
  domainName: DOMAIN_NAME,
  webAclArn: rou39Waf.webAclArn,
});

// Monitoring stack (budget alerts)
new MonitoringStack(app, 'PortfolioMonitoring', { env });

// Mail stack: rou39.com 宛のメールを SES で受信して Gmail に転送 (us-east-1 限定)
new MailStack(app, 'PortfolioMail', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
  domainName: DOMAIN_NAME,
  forwardTo: process.env.ALERT_EMAIL || 'kuronekorou39@gmail.com',
  fromAddress: `forward@${DOMAIN_NAME}`,
  hostedZone: frontendHostedZone,
});

// ============================================================
// uraneko.rou39.com (動画販売サブドメイン)
// ============================================================

const uranekoHostedZone = route53.HostedZone.fromHostedZoneAttributes(
  app, 'UranekoHostedZone', {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: DOMAIN_NAME,
  },
);

const uranekoStorage = new UranekoStorageStack(app, 'UranekoStorage', { env });
const uranekoSecrets = new UranekoSecretsStack(app, 'UranekoSecrets', { env });

const uranekoEmail = new UranekoEmailStack(app, 'UranekoEmail', {
  env,
  hostedZone: uranekoHostedZone,
  subdomain: URANEKO_SUBDOMAIN,
});

// uraneko 専用 UserPool。本家 portfolio-users とは会員基盤を分離する。
const uranekoAuth = new UranekoAuthStack(app, 'UranekoAuth', {
  env,
  crossRegionReferences: true,
  certificate,
  hostedZone: uranekoHostedZone,
  authDomain: URANEKO_AUTH_DOMAIN,
  subdomain: URANEKO_SUBDOMAIN,
  fromEmail: uranekoEmail.fromAddress,
  googleClientSecret: uranekoSecrets.googleOAuthClientSecret,
});
// UserPool の SES 送信設定は作成時に identity の検証状態を確認するため、Email スタックを先に
uranekoAuth.addDependency(uranekoEmail);

new UranekoIngestIamStack(app, 'UranekoIngest', {
  env,
  assetsBucket: uranekoStorage.assetsBucket,
  tokensTable: uranekoStorage.tokensTable,
});

const uranekoApi = new UranekoApiStack(app, 'UranekoApi', {
  env,
  productsTable: uranekoStorage.productsTable,
  tokensTable: uranekoStorage.tokensTable,
  ordersTable: uranekoStorage.ordersTable,
  couponsTable: uranekoStorage.couponsTable,
  assetsBucket: uranekoStorage.assetsBucket,
  userPool: uranekoAuth.userPool,
  userPoolClientId: uranekoAuth.userPoolClient.userPoolClientId,
  nowpaymentsApiKey: uranekoSecrets.nowpaymentsApiKey,
  nowpaymentsIpnSecret: uranekoSecrets.nowpaymentsIpnSecret,
  orderAccessSecret: uranekoSecrets.orderAccessSecret,
  siteUrl: `https://${URANEKO_SUBDOMAIN}`,
  fromEmail: uranekoEmail.fromAddress,
});

// [統合移行 Phase 1] 旧 uraneko 専用 WebACL。Rou39Waf に統合済みで未参照。Phase 2 で destroy する。
new UranekoWafStack(app, 'UranekoWaf', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
});

new UranekoFrontendStack(app, 'UranekoFrontend', {
  env,
  crossRegionReferences: true,
  api: uranekoApi.api,
  certificate,
  hostedZone: uranekoHostedZone,
  subdomain: URANEKO_SUBDOMAIN,
  webAclArn: rou39Waf.webAclArn,
});

new UranekoMonitoringStack(app, 'UranekoMonitoring', {
  env,
  alertEmail: process.env.ALERT_EMAIL || 'kuronekorou39@gmail.com',
  checkoutFn: uranekoApi.checkoutFn,
  webhookFn: uranekoApi.webhookFn,
});

// ============================================================
// notes.rou39.com (秘密URLメモサービス Stash Notes)
// 「管理=Googleログイン必須 / 利用=秘密URLでログイン不要」
// 設計と段取りは docs/notes-implementation-plan.md を参照。
// ============================================================

// Storage / Secrets / Auth / Api まで。Waf/Frontend/Monitoring は以降のフェーズで追加する。
// NotesAuth は Google 連携のみ(NotesEmail・pre-signup 不要)。認証ドメインはカスタム
// notes-auth.rou39.com で、uraneko-auth と同様に共有証明書 + crossRegionReferences を使う。
const notesHostedZone = route53.HostedZone.fromHostedZoneAttributes(
  app, 'NotesHostedZone', {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: DOMAIN_NAME,
  },
);

const notesStorage = new NotesStorageStack(app, 'NotesStorage', { env });
const notesSecrets = new NotesSecretsStack(app, 'NotesSecrets', { env });

const notesAuth = new NotesAuthStack(app, 'NotesAuth', {
  env,
  crossRegionReferences: true,
  certificate,
  hostedZone: notesHostedZone,
  authDomain: NOTES_AUTH_DOMAIN,
  subdomain: NOTES_SUBDOMAIN,
  googleClientSecret: notesSecrets.googleOAuthClientSecret,
});

const notesApi = new NotesApiStack(app, 'NotesApi', {
  env,
  usersTable: notesStorage.usersTable,
  memosTable: notesStorage.memosTable,
  tabsTable: notesStorage.tabsTable,
  tokensTable: notesStorage.tokensTable,
  accessLogsTable: notesStorage.accessLogsTable,
  ipHashSecret: notesSecrets.ipHashSecret,
  originVerifySecret: notesSecrets.originVerifySecret,
  userPool: notesAuth.userPool,
  siteUrl: `https://${NOTES_SUBDOMAIN}`,
});

// [統合移行 Phase 1] 旧 notes 専用 WebACL。Rou39Waf に統合済みで未参照。Phase 2 で destroy する。
new NotesWafStack(app, 'NotesWaf', {
  env: { account: env.account, region: 'us-east-1' },
  crossRegionReferences: true,
});

new NotesFrontendStack(app, 'NotesFrontend', {
  env,
  crossRegionReferences: true,
  api: notesApi.api,
  certificate,
  hostedZone: notesHostedZone,
  subdomain: NOTES_SUBDOMAIN,
  authDomain: NOTES_AUTH_DOMAIN,
  webAclArn: rou39Waf.webAclArn,
  originVerifySecret: notesSecrets.originVerifySecret,
});

new NotesMonitoringStack(app, 'NotesMonitoring', {
  env,
  alertEmail: process.env.ALERT_EMAIL || 'kuronekorou39@gmail.com',
  getMemoFn: notesApi.getMemoFn,
  saveTabFn: notesApi.saveTabFn,
  flushFn: notesApi.flushFn,
  issueMemoFn: notesApi.issueMemoFn,
  memosTable: notesStorage.memosTable,
  tabsTable: notesStorage.tabsTable,
});
