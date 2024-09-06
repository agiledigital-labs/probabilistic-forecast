import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "path";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export class ProbabilisticForecastStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const jiraTicketForecastDLQ = new sqs.Queue(this, "JiraTicketForecastDLQ", {
      queueName: "jira-ticket-forecast-dlq"
    });

    const jiraTicketForecastQueue = new sqs.Queue(this, "JiraTicketForecastQueue", {
      queueName: "jira-ticket-forecast-queue",
      visibilityTimeout: cdk.Duration.minutes(5),
      retentionPeriod: cdk.Duration.days(5),
      deadLetterQueue: {
        queue: jiraTicketForecastDLQ,
        maxReceiveCount: 3,
      },
    });

    // TODO: update the parameters.
    const jiraHost = ssm.StringParameter.valueForStringParameter(this, "/add-jira/ad/jira-cloud-host-staging");
    const jiraUsername = ssm.StringParameter.valueForStringParameter(this, "/add-jira/ad/jira-cloud-username-staging");

    // AWS managed layer.
    // @see https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html#ps-integration-lambda-extensions-add
    const parametersAndSecretsExtension = lambda.ParamsAndSecretsLayerVersion.fromVersionArn(
      "arn:aws:lambda:ap-southeast-2:665172237481:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11",
    );
    
    const getParameterPolicy = new iam.PolicyStatement({
      actions: [
        "ssm:GetParameter"
      ],
      resources: ['*'],
    });

    const collectorLambdaRole = new iam.Role(this, 'ProbabilisticForecastCollectorLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    collectorLambdaRole.addToPolicy(getParameterPolicy);
    collectorLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    const collectorLambda = new NodejsFunction(this, "ProbabilisticForecastCollector", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../src/lambdas/forecast-collector/index.ts"),
      handler: "handler",
      memorySize: 1024,
      timeout: cdk.Duration.minutes(10),
      bundling: {
        minify: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        JIRA_TICKET_FORECAST_QUEUE_URL: jiraTicketForecastQueue.queueUrl,
        JIRA_HOST: jiraHost,
        JIRA_USERNAME: jiraUsername,
      },
      paramsAndSecrets: parametersAndSecretsExtension,
      role: collectorLambdaRole
    });

    jiraTicketForecastQueue.grantSendMessages(collectorLambda);

    const runnerLambdaRole = new iam.Role(this, 'ProbabilisticForecastRunnerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    runnerLambdaRole.addToPolicy(getParameterPolicy);
    runnerLambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    const runnerLambda = new NodejsFunction(this, "ProbabilisticForecastRunner", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../src/lambdas/forecast-runner/index.ts"),
      handler: "handler",
      memorySize: 1024,
      timeout: cdk.Duration.minutes(5),
      bundling: {
        minify: true,
        externalModules: ["aws-sdk"],
      },
      environment: {
        JIRA_HOST: jiraHost,
        JIRA_USERNAME: jiraUsername,
      },
      paramsAndSecrets: parametersAndSecretsExtension,
      role: runnerLambdaRole
    });

    jiraTicketForecastQueue.grantConsumeMessages(runnerLambda);

    runnerLambda.addEventSource(new SqsEventSource(jiraTicketForecastQueue));
  }
}
