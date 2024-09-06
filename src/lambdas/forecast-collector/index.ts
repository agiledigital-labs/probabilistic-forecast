import JiraApi from "jira-client";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getSsmSecretJiraApiToken } from "../../services/ssm";

const jiraHost = process.env.JIRA_HOST;
const jiraUsername = process.env.JIRA_USERNAME;
const jiraTicketForecastQueueUrl = process.env.JIRA_TICKET_FORECAST_QUEUE_URL;

type JiraIssue = { fields: { project: { id: string } }; key: string };

type JiraIssueWithBoardId = { ticketId: string; boardId?: string };

const sqsClient = new SQSClient();

export const handler = async () => {
  const jiraPassword = await getSsmSecretJiraApiToken();

  if (
    jiraHost === undefined ||
    jiraUsername === undefined ||
    jiraPassword === undefined ||
    jiraTicketForecastQueueUrl === undefined
  ) {
    const errorMessage = "Missing Jira configuration parameters: JIRA_TICKET_FORECAST_QUEUE_URL, JIRA_HOST, JIRA_USERNAME or JIRA_PASSWORD.";
    console.error(errorMessage);
    return errorMessage;
  }

  const jira = new JiraApi({
    protocol: "https",
    host: jiraHost,
    username: jiraUsername,
    password: jiraPassword,
    apiVersion: "2",
    strictSSL: true,
  });

  const searchJiraResult = await jira.searchJira(
    "labels = forecast ORDER BY created DESC",
    { maxResults: 1000, fields: ["key", "project"] }
  );

  const tickets: JiraIssueWithBoardId[] = await searchJiraResult.issues.reduce(
    async (acc: Promise<JiraIssueWithBoardId[]>, issue: JiraIssue) => {
      const previous = await acc;

      const projectId = issue.fields.project.id;

      const projectBoardsResult = await jira.getAllBoards(
        undefined,
        undefined,
        undefined,
        undefined,
        projectId
      );

      const issuesWithBoardId: JiraIssueWithBoardId[] = await Promise.all(
        projectBoardsResult.values.map(async (board: { id: string }) => {
          const issuesResult = await jira.getIssuesForBoard(
            board.id,
            0,
            undefined,
            `issue = ${issue.key}`,
            undefined,
            "key"
          );

          if (issuesResult.total === 1) {
            return {
              ticketId: issue.key,
              boardId: board.id,
            };
          }

          return {
            ticketId: issue.key,
          };
        })
      );

      return previous.concat(issuesWithBoardId.flat());
    },
    Promise.resolve([])
  );

  const ticketsOnBoard = tickets.filter(ticket => ticket.boardId !== undefined);

  await Promise.all(ticketsOnBoard.map(async (ticket) => {
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: jiraTicketForecastQueueUrl,
      MessageBody: JSON.stringify(ticket)
    });

    await sqsClient.send(sendMessageCommand);

    return "sent";
  }));

  return `[${ticketsOnBoard.length}] tickets on board are sent to the queue for forecasting...`;
};
