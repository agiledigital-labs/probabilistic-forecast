import {
  calculateTicketTarget,
  printPredictions,
  simulations,
} from "./forecast";
import { jiraClient } from "./jira";

const daysInWeek = 7;
const jiraHost = process.env.JIRA_HOST;
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const userProvidedJiraProjectIDs = (process.env.JIRA_PROJECT_ID ?? "")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => x !== "");
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
    jiraHost === undefined ||
    jiraUsername === undefined ||
    jiraPassword === undefined ||
    jiraBoardID === undefined ||
    jiraTicketID === undefined
  ) {
    console.error(
      `Usage: JIRA_HOST="example.com" JIRA_BOARD_ID=74 JIRA_TICKET_ID=ADE-1234 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start`
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

  console.log(`Connecting to Jira and getting board ${jiraBoardID}.`);
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
  console.log(
    `Counting tickets ahead of ${jiraTicketID} in board ${jiraBoardID}...`
  );
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
  const {
    numberOfTicketsAboveTarget,
    lowTicketTarget,
    highTicketTarget,
  } = await calculateTicketTarget(
    bugRatio,
    discoveryRatio,
    jiraBoardID,
    jiraTicketID,
    tickets,
    userSuppliedTicketTarget
  );

  console.log(
    `There are ${tickets.issues.length} tickets in board ${jiraBoardID} that are either in progress or still to do. Of those, ${numberOfTicketsAboveTarget} tickets are ahead of ${jiraTicketID} in priority order.`
  );

  console.log(`Project interval is ${timeLength} ${timeUnit}`);
  console.log(
    `The team's past performance will be measured based on tickets in project(s) ${jiraProjectIDs.join(
      ", "
    )} that have been resolved in the last ${
      numDaysOfHistory / durationInDays
    } project intervals (${numDaysOfHistory} days of history will be considered in total).`
  );
  const resolvedTicketCounts = await jira.fetchResolvedTicketsPerTimeInterval(
    jiraProjectIDs
  );

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

  if (isFinite(discoveryRatio)) {
    console.log(
      `1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`
    );
  } else {
    console.log("No non-bug tickets created.");
  }

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
