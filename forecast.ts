import JiraApi from "jira-client";

const daysInWeek = 7;
const jiraHost = process.env.JIRA_HOST ?? "jira.agiledigital.com.au";
const jiraPort = process.env.JIRA_PORT;
const jiraProtocol = process.env.JIRA_PROTOCOL ?? "https";
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const jiraProjectID = process.env.JIRA_PROJECT_ID;
const jiraBoardID = process.env.JIRA_BOARD_ID;
const jiraTicketID = process.env.JIRA_TICKET_ID;
// the number of days JIRA goes back to collect data for simulation
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

const jira = new JiraApi({
  protocol: jiraProtocol,
  host: jiraHost,
  port: jiraPort,
  username: jiraUsername,
  password: jiraPassword,
  apiVersion: "2",
  strictSSL: true,
});

type TicketResponse = {
  readonly total: number;
  readonly issues: ReadonlyArray<string>;
};

// convert provided time interval into days
const durationInDays =
  timeUnit === "days" ? timeLength : timeLength * daysInWeek;

/**
 * Collects issues from JIRA to analyse and facilitate prediction.
 *
 * @param searchQuery Query to retrieve data from JIRA.
 * @param maxResults Maximum number of results to retrieve.
 * @returns The tickets retrieved from JIRA.
 */
const issuesForSearchQuery = async (
  searchQuery: string,
  maxResults: number = 1000
): Promise<TicketResponse> => {
  const issuesResp = await jira.searchJira(searchQuery, { maxResults });
  return parseJiraResponse(issuesResp);
};

// TODO: It would be better to use the date QA was completed for the ticket instead of the date the
//       ticket was resolved.
/**
 * Gets tickets resolved in each time interval cycle.
 *
 * @returns An array of number of tickets resolved in each time interval.
 */
const fetchResolvedTicketsPerTimeInterval = async () => {
  // We want to know how many tickets were completed during each time interval. If not defined,
  // our time interval is just any period of two weeks.
  let historyStart = -durationInDays;
  let historyEnd = 0;
  const ticketCounts: Promise<TicketResponse>[] = [];

  while (historyStart >= -1 * numDaysOfHistory) {
    const query =
      `project = ${jiraProjectID} AND issuetype in standardIssueTypes() AND issuetype != Epic ` +
      `AND resolved >= ${historyStart}d AND resolved <= ${historyEnd}d`;

    ticketCounts.push(issuesForSearchQuery(query));

    historyStart -= durationInDays;
    historyEnd -= durationInDays;
  }

  return Promise.all(ticketCounts);
};

/**
 * Gets the bug ratio for "1 bug every X stories" statement.
 *
 * @param _jiraTicketID The JIRA ticket for forecast.
 * @param _inProgress The in-progress tickets.
 * @param _toDo The tickets that are still waiting to be worked on.
 * @returns Number of bugs per stories count.
 */
const fetchBugRatio = async (
  _jiraTicketID: string | undefined,
  _inProgress: TicketResponse,
  _toDo: TicketResponse
) => {
  // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
  const bugsQuery = `project = ${jiraProjectID} AND issuetype = Fault AND created >= -${numDaysOfHistory}d`;
  const bugCount = (await issuesForSearchQuery(bugsQuery, 0)).total;

  // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
  const otherTicketsQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND issuetype != Fault AND created >= -${numDaysOfHistory}d`;
  const otherTicketCount = (await issuesForSearchQuery(otherTicketsQuery, 0))
    .total;

  return otherTicketCount / bugCount;
};

/**
 * Gets the new story ratio for "1 new story [created] every X stories [resolved]" statement.
 *
 * @param _jiraTicketID The JIRA ticket for forecast.
 * @param _inProgress The in-progress tickets.
 * @param _toDo The tickets that are still waiting to be worked on.
 * @returns Number of new stories created per resolved stories count.
 */
const fetchDiscoveryRatio = async (
  _jiraTicketID: string | undefined,
  _inProgress: TicketResponse,
  _toDo: TicketResponse
) => {
  // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
  const nonBugTicketsCreatedQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND issuetype != Fault AND created >= -${numDaysOfHistory}d`;
  const nonBugTicketsCreatedCount = (
    await issuesForSearchQuery(nonBugTicketsCreatedQuery, 0)
  ).total;

  const ticketsResolvedQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND resolved >= -${numDaysOfHistory}d`;
  const ticketsResolvedCount = (
    await issuesForSearchQuery(ticketsResolvedQuery, 0)
  ).total;

  return ticketsResolvedCount / nonBugTicketsCreatedCount;
};

/**
 * Parses to issue list and total number.
 *
 * @param response The query response from JIRA API.
 * @returns An object consisting of issues and total count.
 */
const parseJiraResponse = (response: JiraApi.JsonResponse): TicketResponse => {
  // TODO parse the response using io-ts.
  return {
    issues: response.issues.map((issue: any) => issue.key),
    total: response.total,
  };
};

/**
 * Returns all tickets (issue keys) for the specified board in the specified status.
 * Handles pagination with the Jira API and returns everything.
 *
 * @param jiraBoardID The id of the Kanban board.
 * @param statusCategory The status based on which issues will be picked.
 * @returns An object consisting of issues and total count.
 */
const issuesForBoard = async (
  jiraBoardID: string,
  statusCategory: "In Progress" | "To Do"
): Promise<TicketResponse> => {
  // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
  const response = await jira.getIssuesForBoard(
    jiraBoardID,
    undefined,
    1000,
    `issuetype in standardIssueTypes() and issuetype != Epic and statusCategory = "${statusCategory}"`
  );

  if (response.total > response.issues.length) {
    console.warn(`Some ${statusCategory} tickets excluded.`);
  }

  return parseJiraResponse(response);
};

/**
 * Estimates the number of tickets to complete before getting to the supplied ticket.
 *
 * @param bugRatio Number of bugs per ticket.
 * @param discoveryRatio Number of new tickets per resolved ticket.
 * @param jiraBoardID ID of the Kanban board.
 * @param jiraTicketID ID of the JIRA ticket to forecast.
 * @param inProgress Current in-progress tickets.
 * @param toDo Current to-do tickets.
 * @returns The expected number of tickets left to complete, as a range.
 */
const calculateTicketTarget = async (
  bugRatio: number,
  discoveryRatio: number,
  jiraBoardID: string | undefined,
  jiraTicketID: string | undefined,
  inProgress: TicketResponse,
  toDo: TicketResponse
): Promise<{ lowTicketTarget: number; highTicketTarget: number }> => {
  let ticketTarget = userSuppliedTicketTarget;

  if (jiraBoardID !== undefined && jiraTicketID !== undefined) {
    const numberOfInProgressTickets = inProgress.total;
    const numberOfBacklogTicketsAboveTarget = toDo.issues.indexOf(jiraTicketID);
    if (numberOfBacklogTicketsAboveTarget === -1) {
      throw new Error(
        `Ticket ${jiraTicketID} not found in backlog for board ${jiraBoardID}`
      );
    }

    // + 1 to include the target ticket itself.
    ticketTarget =
      numberOfInProgressTickets + numberOfBacklogTicketsAboveTarget + 1;
    console.log(
      `${ticketTarget} total tickets until ${jiraTicketID} is to be completed (${numberOfInProgressTickets} in progress + ${numberOfBacklogTicketsAboveTarget} above in the backlog + ${jiraTicketID} itself)`
    );
  }

  // TODO: expand this to allow other sorts of targets in addition to a single Jira ticket ID.
  // Examples: "when will all tickets in epic x be done?", "when will all tickets with label y be done?"

  return {
    lowTicketTarget: ticketTarget,
    // Adjust to account for the new tickets we expect to be created during future development.
    // TODO: Should we use a compounding formula to account for tickets that get created and
    //       then cause new tickets themselves, e.g. bugs introduced by the new features? If so,
    //       should we treat the two ratios differently, since more bugs tend to be created by
    //       feature tickets and bugs usually don't take as long as features?
    highTicketTarget: Math.round(
      ticketTarget + ticketTarget / bugRatio + ticketTarget / discoveryRatio
    ),
  };
};

/**
 * Run Monte Carlo simulations to predict the number of time intervals it will take to complete
 * `ticketTarget` tickets.
 *
 * @param resolvedTicketCounts Each element is the number of tickets that were resolved in a
 *        particular week.
 * @param ticketTarget The number of tickets in the backlog (and in progress) ahead of the target
 *        ticket, plus one for the target ticket itself.
 * @return A Promise that resolves to an array of length `numSimulations` with one element for each
 *         simulation run. Each element is the number of time intervals it took to complete `ticketTarget`
 *         tickets in that simulation.
 */
const simulations = async (
  resolvedTicketCounts: readonly number[],
  ticketTarget: number
): Promise<readonly number[]> => {
  const results: number[] = Array(numSimulations).fill(0);

  if (resolvedTicketCounts.every((x) => x === 0)) {
    // If every single one of our past time intervals completed zero tickets, the loop below will never terminate.
    // So let's say all our "simulations" conclude that we will ship zero tickets this time too.
    return results;
  }

  // TODO: teach the simulation how to understand if some tickets are specialised and can only be worked on by certain people.
  for (let i = 0; i < numSimulations; i++) {
    let storiesDone = 0;
    while (storiesDone <= ticketTarget) {
      const numTimeIntervals = resolvedTicketCounts.length;
      storiesDone += resolvedTicketCounts[
        Math.floor(Math.random() * numTimeIntervals)
      ]!;
      results[i]++;
    }
  }

  return results;
};

/**
 * Prints the predictions realized in relation to the supplied ticket.
 *
 * @param lowTicketTarget Minimum number of tickets to complete.
 * @param highTicketTarget Maximum number of tickets to complete.
 * @param simulationResults Simulation outcomes.
 */
const printPredictions = (
  lowTicketTarget: number,
  highTicketTarget: number,
  simulationResults: readonly number[]
) => {
  console.log(
    `Amount of time required to ship ${lowTicketTarget} to ${highTicketTarget} tickets ` +
      `(and the number of simulations that arrived at that result):`
  );

  const percentages: Record<string, number> = {};
  const cumulativePercentages: Record<string, number> = {};
  let prevCumulativePercentage = 0;
  let resultAboveThreshold: string | undefined = undefined;

  // Count the number of simulations that arrived at each unique result. For example, if 3 of the
  // simulations predicted 17 time intervals until the target ticket will be completed, 5 simulations
  // predicted 18 time intervals and 2 predicted 19 time intervals, then we'd end up with
  // numSimulationsPredicting[17] = 3
  // numSimulationsPredicting[18] = 5
  // numSimulationsPredicting[19] = 2
  const numSimulationsPredicting: Record<string, number> = {};
  for (const result of simulationResults) {
    numSimulationsPredicting[result] =
      (numSimulationsPredicting[result] ?? 0) + 1;
  }

  // This will give us the same array that nub(simulationResults) would, i.e. all duplicate
  // elements removed.
  const uniquePredictions = Object.keys(numSimulationsPredicting);

  // For each result (number of time intervals) predicted by at least one of the simulations
  for (const numIntervalsPredicted of uniquePredictions) {
    percentages[numIntervalsPredicted] =
      ((numSimulationsPredicting[numIntervalsPredicted] ?? 0) /
        numSimulations) *
      100;
    // And the percentage of simulations that predicted this number of time intervals or fewer.
    cumulativePercentages[numIntervalsPredicted] =
      (percentages[numIntervalsPredicted] ?? 0) + prevCumulativePercentage;
    prevCumulativePercentage =
      cumulativePercentages[numIntervalsPredicted] ?? 0;

    // Remember the lowest number of time interval that was predicted frequently enough
    // to pass the confidence threshold.
    if (
      !resultAboveThreshold &&
      (cumulativePercentages[numIntervalsPredicted] ?? 0) >=
        confidencePercentageThreshold
    ) {
      resultAboveThreshold = numIntervalsPredicted;
    }

    // Print the confidence (i.e. likelihood) we give for completing the tickets in this amount
    // of time.
    console.log(
      `${Number(numIntervalsPredicted) * durationInDays} days, ` +
        `${Math.floor(
          cumulativePercentages[numIntervalsPredicted] ?? 0
        )}% confidence ` +
        `(${numSimulationsPredicting[numIntervalsPredicted]} simulations)` +
        // Pluralize
        `${numSimulationsPredicting[numIntervalsPredicted] === 1 ? "" : "s"})`
    );
  }

  console.log(
    `We are ${
      resultAboveThreshold
        ? Math.floor(cumulativePercentages[resultAboveThreshold] ?? 0)
        : "?"
    }% confident all ` +
      `${lowTicketTarget} to ${highTicketTarget} tickets will take no more than ${
        Number(resultAboveThreshold) * durationInDays
      } days to complete.`
  );
};

const main = async () => {
  if (
    jiraUsername === undefined ||
    jiraPassword === undefined ||
    jiraProjectID === undefined ||
    jiraBoardID === undefined
  ) {
    console.error(
      "Usage: JIRA_PROJECT_ID=ADE JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start"
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

  const board = await jira.getBoard(jiraBoardID);

  if (board.type === "scrum") {
    // TODO `getIssuesForBoard` doesn't appear to return tickets in a useful backlog order for scrum boards, so we have to do some work to support scrum boards.
    // See https://github.com/agiledigital-labs/probabilistic-forecast/issues/7
    throw new Error("Scrum boards are not (yet) supported.");
  }

  if (board.type !== "kanban") {
    throw new Error(
      `Unknown board type [${board.type}] for board [${jiraBoardID}].`
    );
  }

  // TODO: if a ticket has a fix version it will no longer appear on the kanban even if it's still in progress. Such tickets will show up here even though we shouldn't consider them truly in progress or to do.
  // TODO: Include tickets in Resolved in the inProgress count, since they still need to be QA'd.
  console.log(`Counting tickets ahead of ${jiraTicketID} in your backlog...`);
  const inProgress = await issuesForBoard(jiraBoardID, "In Progress");
  const toDo = await issuesForBoard(jiraBoardID, "To Do");
  const bugRatio =
    bugRatioOverride ?? (await fetchBugRatio(jiraTicketID, inProgress, toDo));
  const discoveryRatio =
    discoveryRatioOverride ??
    (await fetchDiscoveryRatio(jiraTicketID, inProgress, toDo));
  const { lowTicketTarget, highTicketTarget } = await calculateTicketTarget(
    bugRatio,
    discoveryRatio,
    jiraBoardID,
    jiraTicketID,
    inProgress,
    toDo
  );

  console.log(`Project interval is ${timeLength} ${timeUnit}`);
  console.log(
    `Fetching ticket counts for the last ${
      numDaysOfHistory / durationInDays
    } project intervals in ${jiraProjectID}...`
  );
  const resolvedTicketCounts = await fetchResolvedTicketsPerTimeInterval();

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

  // resolvedTicketCounts.forEach(async (ticketCount, idx) => {
  //   // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
  //   //       didn't bother checking.
  //   console.log(
  //     `Resolved ${ticketCount} tickets in project interval ${idx + 1}.`
  //   );
  // });

  if (isFinite(bugRatio)) {
    console.log(`1 bug ticket created for every ${bugRatio} non-bug tickets.`);
  } else {
    console.log('No bug tickets created.');
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
    highTicketTarget
  );

  printPredictions(lowTicketTarget, highTicketTarget, simulationResults);
};

main();
