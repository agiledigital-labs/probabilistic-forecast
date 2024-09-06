import {
  calculateTicketTarget,
  getPredictionReport,
  simulations,
} from "./forecast";
import { jiraClient } from "../../services/jira";
import { SQSEvent } from "aws-lambda";
import { getSsmSecretJiraApiToken } from "../../services/ssm";

const daysInWeek = 7;
const jiraHost = process.env.JIRA_HOST;
const jiraUsername = process.env.JIRA_USERNAME;
const userProvidedJiraProjectIDs = (process.env.JIRA_PROJECT_ID ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => x !== "");

// the number of days to go back to collect data for simulation
const numDaysOfHistory =
  Number.parseInt(process.env.NUM_WEEKS_OF_HISTORY ?? "10") * daysInWeek;

const confidencePercentageThreshold = Number.parseInt(
  process.env.CONFIDENCE_PERCENTAGE_THRESHOLD ?? "80"
);
const numSimulations = Number.parseInt(process.env.NUM_SIMULATIONS ?? "1000");
// length and units are in separate variables
const timeLength = Number.parseInt(process.env.TIME_LENGTH ?? "2");
// this can be weeks or days
const timeUnit = process.env.TIME_UNIT ?? "weeks";

const userSuppliedTicketTarget = Number.parseInt(
  process.env.TICKET_TARGET ?? "60"
);
const bugRatioOverride = process.env.BUG_RATIO
  ? Number.parseInt(process.env.BUG_RATIO)
  : undefined;
const discoveryRatioOverride = process.env.DISCOVERY_RATIO
  ? Number.parseInt(process.env.DISCOVERY_RATIO)
  : undefined;

// convert provided time interval into days
const durationInDays =
  timeUnit === "days" ? timeLength : timeLength * daysInWeek;


const handleRecord = async (jiraTicketID: string, jiraBoardID: string) => {
  const jiraPassword = await getSsmSecretJiraApiToken();

  if (
    jiraHost === undefined ||
    jiraUsername === undefined ||
    jiraPassword === undefined
  ) {
    console.error(
      `Missing JIRA_HOST, JIRA_BOARD_ID, JIRA_TICKET_ID, JIRA_USERNAME or JIRA_PASSWORD.`
    );
    return "Config Error";
  }

  if (
    !(timeUnit === "weeks" || timeUnit === "days" || timeUnit === undefined)
  ) {
    const errorMessage = "Only weeks and days are supported for project interval time units";
    console.error(errorMessage);
    return errorMessage;
  }

  console.info(`Connecting to Jira and getting board ${jiraBoardID}.`);
  const jira = await jiraClient(
    jiraHost,
    process.env.JIRA_PORT,
    process.env.JIRA_PROTOCOL ?? "https",
    jiraUsername,
    jiraPassword,
    jiraBoardID,
    durationInDays,
    numDaysOfHistory
  );

  // All in progress or to do Jira tickets for the given board (either kanban or scrum).
  let progressReport = `Counting tickets ahead of ${jiraTicketID} in board ${jiraBoardID}...\n`;

  const tickets = await jira.issuesForBoard();

  // The Jira project IDs used to measure team performance (velocity, ticket creation rate, etc).
  // If not provided by the user, will be inferred based on the unique project IDs of the tickets above (via roundtrip through a set).
  // There is a slight gotcha here: if the team has resolved a bunch of tickets from a project that isn't represented among the tickets
  // above, the velocity will appear lower than it actually is. To avoid this, specify a complete set of project IDs explicitly.
  const inferredJiraProjectIDs = [
    ...new Set(tickets.issues.map((x) => x.substring(0, x.indexOf("-")))),
  ];
  const jiraProjectIDs =
    userProvidedJiraProjectIDs.length > 0
      ? userProvidedJiraProjectIDs
      : inferredJiraProjectIDs;

  const bugRatio =
    bugRatioOverride ?? (await jira.fetchBugRatio(jiraProjectIDs));
  const discoveryRatio =
    discoveryRatioOverride ?? (await jira.fetchDiscoveryRatio(jiraProjectIDs));
  const { numberOfTicketsAboveTarget, lowTicketTarget, highTicketTarget } =
    await calculateTicketTarget(
      bugRatio,
      discoveryRatio,
      jiraBoardID,
      jiraTicketID,
      tickets,
      userSuppliedTicketTarget
    );

  progressReport += `There are ${tickets.issues.length} tickets in board ${jiraBoardID} that are either in progress or still to do. Of those, ${numberOfTicketsAboveTarget} tickets are ahead of ${jiraTicketID} in priority order.\n`;
  progressReport += `Project interval is ${timeLength} ${timeUnit}\n`; 
  progressReport += `The team's past performance will be measured based on tickets in project(s) ${jiraProjectIDs.join(
    ", "
  )} that have been resolved in the last ${
    numDaysOfHistory / durationInDays
  } project intervals (${numDaysOfHistory} days of history will be considered in total).\n\n`

  const resolvedTicketCounts = await jira.fetchResolvedTicketsPerTimeInterval(
    jiraProjectIDs
  );

  await Promise.all(
    resolvedTicketCounts.map(async (ticketsInTimeInterval, idx) => {
      progressReport += `Resolved ${ticketsInTimeInterval.total} tickets in project interval ${
        idx + 1
      }: `;

      // Print the ticket IDs. This is useful if you're running simulations regularly and saving
      // the results.
      progressReport += `${ticketsInTimeInterval.issues.join(", ")}\n`;
    })
  );

  progressReport += "\n";

  if (isFinite(bugRatio)) {
    progressReport += `1 bug ticket created for every ${bugRatio} non-bug tickets.\n`;
  } else {
    progressReport += "No bug tickets created.\n"
  }

  if (isFinite(discoveryRatio)) {
    progressReport += `1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.\n`;
  } else {
    progressReport += "No non-bug tickets created.\n";
  }

  progressReport += `If the team continues to create new tickets at this rate, we predict the ${lowTicketTarget} outstanding tickets ` +
    `will have grown to ${highTicketTarget} tickets by the time they have all been completed.\n`

  progressReport += `Running ${numSimulations} simulations...\n`;

  const simulationResults = await simulations(
    resolvedTicketCounts.map((tickets) => tickets.total),
    highTicketTarget,
    numSimulations
  );

  const predictionReport = getPredictionReport(
    lowTicketTarget,
    highTicketTarget,
    simulationResults,
    numSimulations,
    confidencePercentageThreshold,
    durationInDays
  );

  return await jira.commentIssue(jiraTicketID, `*Probabilistic Forecast*\n\n${progressReport}\n${predictionReport}`);
}

export const handler = async (event: SQSEvent) => {
  const records = event.Records;

  const reports = await Promise.all(records.map(async (record) => {
    const jiraIssue: { ticketId: string, boardId: string} = JSON.parse(record.body);
    
    const handleResponse = await handleRecord(jiraIssue.ticketId, jiraIssue.boardId);

    return handleResponse;
  }));

  return reports;
};
