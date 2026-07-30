#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { loadConfig } from '../lib/config';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();

// Select environment via context: `cdk deploy -c env=dev`.
const envName = (app.node.tryGetContext('env') as string) || 'dev';
const config = loadConfig(envName);

const awsEnv: cdk.Environment = {
  account: config.account,
  region: config.region,
};

const prefix = `${config.appName}-${config.env}`;

new FrontendStack(app, `${prefix}-frontend`, { env: awsEnv, config });

cdk.Tags.of(app).add('app', config.appName);
cdk.Tags.of(app).add('env', config.env);
cdk.Tags.of(app).add('tier', 'frontend');

app.synth();
