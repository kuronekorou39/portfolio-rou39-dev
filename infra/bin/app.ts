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
import { MonitoringStack } from '../lib/monitoring-stack';

const app = new cdk.App();

const DOMAIN_NAME = 'rou39.com';
const AUTH_DOMAIN = `auth.${DOMAIN_NAME}`;
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

new FrontendStack(app, 'PortfolioFrontend', {
  env,
  crossRegionReferences: true,
  api: api.api,
  certificate,
  hostedZone: frontendHostedZone,
  domainName: DOMAIN_NAME,
});

// Monitoring stack (budget alerts)
new MonitoringStack(app, 'PortfolioMonitoring', { env });
