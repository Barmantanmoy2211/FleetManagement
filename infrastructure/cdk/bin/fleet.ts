#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { FleetFoundationStack } from "../lib/fleet-foundation-stack";

const app = new cdk.App();
const envName = app.node.tryGetContext("env") ?? "dev";

new FleetFoundationStack(app, `FleetFoundation-${envName}`, {
  envName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
