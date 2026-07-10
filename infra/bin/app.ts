#!/usr/bin/env node
import 'source-map-support/register';
import { config } from 'dotenv';
config({ path: require('path').join(__dirname, '../../.env') });
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { WafStack } from '../lib/waf-stack';
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

const app = new cdk.App();

const DOMAIN_NAME = 'rou39.com';
const AUTH_DOMAIN = `auth.${DOMAIN_NAME}`;
const URANEKO_SUBDOMAIN = `uraneko.${DOMAIN_NAME}`;
// uraneko 専用の Cognito 認証ドメイン。auth.uraneko.rou39.com は
// *.rou39.com ワイルドカード証明書の対象外(2階層)なので1階層に置く。
const URANEKO_AUTH_DOMAIN = `uraneko-auth.${DOMAIN_NAME}`;
const HOSTED_ZONE_ID = 'Z064847133X63Y56L8D3W';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

const storage = new StorageStack(app, 'PortfolioStorage', { env });

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
});

// Frontend with custom domain
const frontendHostedZone = route53.HostedZone.fromHostedZoneAttributes(
  app, 'FrontendHostedZone', {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: DOMAIN_NAME,
  },
);

// CloudFront 用 WAFv2 WebACL は us-east-1 必須
const waf = new WafStack(app, 'PortfolioWaf', {
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
  webAclArn: waf.webAclArn,
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

// uraneko CloudFront 用 WAFv2 WebACL は us-east-1 必須
const uranekoWaf = new UranekoWafStack(app, 'UranekoWaf', {
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
  webAclArn: uranekoWaf.webAclArn,
});

new UranekoMonitoringStack(app, 'UranekoMonitoring', {
  env,
  alertEmail: process.env.ALERT_EMAIL || 'alert@example.com',
  checkoutFn: uranekoApi.checkoutFn,
  webhookFn: uranekoApi.webhookFn,
});
