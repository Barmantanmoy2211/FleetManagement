import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as apigwAuthorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as path from "path";
import { backendLambdaBundling } from "./backend-lambda-code";

export interface FleetFoundationStackProps extends cdk.StackProps {
  envName: string;
}

const ROLES = [
  "PlatformAdmin",
  "FleetAdmin",
  "FleetManager",
  "Driver",
  "Viewer",
];

export class FleetFoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FleetFoundationStackProps) {
    super(scope, id, props);

    const { envName } = props;
    const prefix = `fleet-${envName}`;

    const table = new dynamodb.Table(this, "OperationalTable", {
      tableName: `${prefix}-operational`,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: envName !== "dev",
      removalPolicy: envName === "dev" ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const documentsBucket = new s3.Bucket(this, "DocumentsBucket", {
      bucketName: undefined,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: envName === "dev" ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: envName === "dev",
    });

    const webLoginUrl =
      (this.node.tryGetContext("webLoginUrl") as string) || "http://localhost:5173/login";

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${prefix}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      email: cognito.UserPoolEmail.withCognito(),
      userInvitation: {
        emailSubject: "Fleet Intelligence — complete your account setup",
        emailBody:
          "You have been invited to Fleet Intelligence.\n\n" +
          "Username: {username}\n" +
          "Temporary password: {####}\n\n" +
          `Sign in at ${webLoginUrl}\n` +
          "You must set a new password when you first sign in.\n",
      },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      customAttributes: {
        tenant_id: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      removalPolicy: envName === "dev" ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    ROLES.forEach((role) => {
      new cognito.CfnUserPoolGroup(this, `Group${role}`, {
        groupName: role,
        userPoolId: userPool.userPoolId,
      });
    });

    const userPoolClient = userPool.addClient("WebClient", {
      userPoolClientName: `${prefix}-web`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: ["http://localhost:5173/", "http://localhost:5173/login"],
        logoutUrls: ["http://localhost:5173/login"],
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
    });

    const backendPath = path.join(__dirname, "../../../services/backend");

    const apiFn = new lambda.Function(this, "ApiFunction", {
      functionName: `${prefix}-api`,
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "app.handler.handler",
      code: lambda.Code.fromAsset(backendPath, {
        bundling: backendLambdaBundling(backendPath),
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(29),
      environment: {
        DYNAMODB_TABLE_NAME: table.tableName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_REGION: cdk.Stack.of(this).region,
        CORS_ORIGINS: "http://localhost:5173",
        SKIP_JWT_VERIFY: "false",
        SEND_INVITE_EMAIL: "true",
        APP_ENV: envName,
      },
    });

    table.grantReadWriteData(apiFn);
    documentsBucket.grantReadWrite(apiFn);

    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminListGroupsForUser",
        ],
        resources: [userPool.userPoolArn],
      }),
    );

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: `${prefix}-http`,
      corsPreflight: {
        allowHeaders: ["Authorization", "Content-Type", "X-Amz-Date", "X-Api-Key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["http://localhost:5173"],
        maxAge: cdk.Duration.days(1),
      },
    });

    const jwtAuthorizer = new apigwAuthorizers.HttpJwtAuthorizer(
      "CognitoJwtAuthorizer",
      `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
      {
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ["$request.header.Authorization"],
      },
    );

    const lambdaIntegration = new apigwIntegrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFn,
    );

    httpApi.addRoutes({
      path: "/api/v1/health",
      methods: [apigwv2.HttpMethod.GET],
      integration: lambdaIntegration,
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PATCH,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: lambdaIntegration,
      authorizer: jwtAuthorizer,
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "HTTP API base URL (set VITE_API_URL)",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito app client ID",
    });

    new cdk.CfnOutput(this, "DocumentsBucketName", {
      value: documentsBucket.bucketName,
    });

    new cdk.CfnOutput(this, "DynamoTableName", {
      value: table.tableName,
    });
  }
}
