#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { AuthStack } from '../lib/auth-stack';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

const storage = new StorageStack(app, 'PortfolioStorage', { env });
const auth = new AuthStack(app, 'PortfolioAuth', { env });
const api = new ApiStack(app, 'PortfolioApi', {
  env,
  projectsTable: storage.projectsTable,
  reviewsTable: storage.reviewsTable,
  pageViewsTable: storage.pageViewsTable,
  assetsBucket: storage.assetsBucket,
  userPool: auth.userPool,
});
new FrontendStack(app, 'PortfolioFrontend', {
  env,
  api: api.api,
});
