import {
  calculateTicketTarget,
  printPredictions,
  simulations,
} from "./forecast";
import { jiraClient } from "./jira";

const daysInWeek = 7;
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const jiraProjectID = process.env.JIRA_PROJECT_ID;
const jiraBoardID = process.env.JIRA_BOARD_ID;
const jiraTicketID = process.env.JIRA_TICKET_ID;
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

const main = async () => {
  if (
    jiraUsername === undefined ||
    jiraPassword === undefined ||
    jiraProjectID === undefined ||
    jiraBoardID === undefined ||
    jiraTicketID === undefined
  ) {
    console.error(
      "Usage: JIRA_PROJECT_ID=ADE JIRA_BOARD_ID=74 JIRA_TICKET_ID=ADE-1234 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start"
    );
    return;
  }

  if (
    !(timeUnit === "weeks" || timeUnit === "days" || timeUnit === undefined)
  ) {
    console.error(
      "Only weeks and days are supported for project interval time units"
    );
    return;
  }

  // TODO: if a ticket has a fix version it will no longer appear on the kanban even if it's still in progress. Such tickets will show up here even though we shouldn't consider them truly in progress or to do.
  // TODO: Include tickets in Resolved in the inProgress count, since they still need to be QA'd.
  console.log(`Counting tickets ahead of ${jiraTicketID} in your backlog...`);

  const jira = await jiraClient(
    process.env.JIRA_HOST ?? "jira.agiledigital.com.au",
    process.env.JIRA_PORT,
    process.env.JIRA_PROTOCOL ?? "https",
    jiraUsername,
    jiraPassword,
    jiraProjectID,
    jiraBoardID,
    durationInDays,
    numDaysOfHistory
  );

  const inProgress = await jira.issuesForBoard("In Progress");
  const toDo = await jira.issuesForBoard("To Do");
  const bugRatio = bugRatioOverride ?? (await jira.fetchBugRatio());
  const discoveryRatio =
    discoveryRatioOverride ?? (await jira.fetchDiscoveryRatio());
  const { lowTicketTarget, highTicketTarget } = await calculateTicketTarget(
    bugRatio,
    discoveryRatio,
    jiraBoardID,
    jiraTicketID,
    inProgress,
    toDo,
    userSuppliedTicketTarget
  );

  console.log(`Project interval is ${timeLength} ${timeUnit}`);
  console.log(
    `Fetching ticket counts for the last ${
      numDaysOfHistory / durationInDays
    } project intervals in ${jiraProjectID}...`
  );
  const resolvedTicketCounts = await jira.fetchResolvedTicketsPerTimeInterval();

  await Promise.all(
    resolvedTicketCounts.map(async (ticketsInTimeInterval, idx) => {
      console.log(
        `Resolved ${ticketsInTimeInterval.total} tickets in project interval ${
          idx + 1
        }:`
      );
      // Print the ticket IDs. This is useful if you're running simulations regularly and saving
      // the results.
      console.log(ticketsInTimeInterval.issues.join(", "));
    })
  );

  if (isFinite(bugRatio)) {
    console.log(`1 bug ticket created for every ${bugRatio} non-bug tickets.`);
  } else {
    console.log("No bug tickets created.");
  }

  console.log(
    `1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`
  );
  console.log(
    `If the team continues to create new tickets at this rate, we predict the ${lowTicketTarget} outstanding tickets ` +
      `will have grown to ${highTicketTarget} tickets by the time they have all been completed.`
  );

  console.log(`Running ${numSimulations} simulations...`);
  const simulationResults = await simulations(
    resolvedTicketCounts.map((tickets) => tickets.total),
    highTicketTarget,
    numSimulations
  );

  printPredictions(
    lowTicketTarget,
    highTicketTarget,
    simulationResults,
    numSimulations,
    confidencePercentageThreshold,
    durationInDays
  );
};

main();
