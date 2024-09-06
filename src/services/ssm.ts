/**
 * Retrieves the secret SSM parameter value for Jira API token.
 * 
 * This is a cached call with AWS Parameters and Secrets Lambda Extension Layer.
 * 
 * @see https://docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html
 * @see https://docs.aws.amazon.com/systems-manager/latest/userguide/ps-integration-lambda-extensions.html
 * 
 * @returns Jira API token.
 */
export const getSsmSecretJiraApiToken = async () => {
  const jiraApiTokenResponse = await fetch(
    `http://localhost:2773/systemsmanager/parameters/get/?name=${encodeURIComponent(
      // TODO: update the parameter name.
      '/add-jira/ad/jira-cloud-api-token-staging',
    )}&withDecryption=true`,
    {
      headers: {
        'X-Aws-Parameters-Secrets-Token': process.env.AWS_SESSION_TOKEN || "",
      },
    },
  );

  const jiraApiTokenJsonValue = await jiraApiTokenResponse.json();

  return jiraApiTokenJsonValue.Parameter.Value;
};
