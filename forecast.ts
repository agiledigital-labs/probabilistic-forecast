import JiraApi from "jira-client";

const jiraHost = process.env.JIRA_HOST ?? "jira.agiledigital.com.au";
const jiraPort = process.env.JIRA_PORT;
const jiraProtocol = process.env.JIRA_PROTOCOL ?? "https";
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const jiraProjectID = process.env.JIRA_PROJECT_ID;
const jiraBoardID = process.env.JIRA_BOARD_ID;
const jiraTicketID = process.env.JIRA_TICKET_ID;
const numWeeksOfHistory = Number.parseInt(
  process.env.NUM_WEEKS_OF_HISTORY ?? "10"
);
const confidencePercentageThreshold = Number.parseInt(
  process.env.CONFIDENCE_PERCENTAGE_THRESHOLD ?? "80"
);
const numSimulations = Number.parseInt(process.env.NUM_SIMULATIONS ?? "1000");
const sprintLengthInWeeks = Number.parseInt(
  process.env.SPRINT_LENGTH_IN_WEEKS ?? "2"
);
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

const issuesForSearchQuery = async (
  searchQuery: string,
  maxResults: number = 1000
): Promise<TicketResponse> => {
  const issuesResp = await jira.searchJira(searchQuery, { maxResults });
  return parseJiraResponse(issuesResp);
};

// TODO: It would be better to use the date QA was completed for the ticket instead of the date the
//       ticket was resolved.
const fetchResolvedTicketsPerSprint = async (): Promise<TicketResponse[]> => {
  // We want to know how many tickets were completed during each sprint. To make things easier,
  // we're defining a sprint as just any period of sprintLengthInWeeks weeks.
  let historyStart = -sprintLengthInWeeks;
  let historyEnd = 0;
  const tickets: Promise<TicketResponse>[] = [];

  while (historyStart >= -1 * numWeeksOfHistory) {
    const query =
      `project = ${jiraProjectID} AND issuetype in standardIssueTypes() AND issuetype != Epic ` +
      `AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;

    tickets.push(issuesForSearchQuery(query));

    historyStart -= sprintLengthInWeeks;
    historyEnd -= sprintLengthInWeeks;
  }

  return Promise.all(tickets);
};

// "1 bug every X stories", which is probably the reciprocal of what you were expecting.
const fetchBugRatio = async (
  _jiraTicketID: string | undefined,
  _inProgress: TicketResponse,
  _toDo: TicketResponse
): Promise<number> => {
  // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
  const bugsQuery = `project = ${jiraProjectID} AND issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
  const bugCount = (await issuesForSearchQuery(bugsQuery, 0)).total;

  // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
  const otherTicketsQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND issuetype != Fault AND created >= -${numWeeksOfHistory}w`;
  const otherTicketCount = (await issuesForSearchQuery(otherTicketsQuery, 0))
    .total;

  return otherTicketCount / bugCount;
};

// "1 new story [created] every X stories [resolved]"
const fetchDiscoveryRatio = async (
  _jiraTicketID: string | undefined,
  _inProgress: TicketResponse,
  _toDo: TicketResponse
): Promise<number> => {
  // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
  const nonBugTicketsCreatedQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND issuetype != Fault AND created >= -${numWeeksOfHistory}w`;
  const nonBugTicketsCreatedCount = (
    await issuesForSearchQuery(nonBugTicketsCreatedQuery, 0)
  ).total;

  const ticketsResolvedQuery =
    `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
    `AND issuetype != Epic AND resolved >= -${numWeeksOfHistory}w`;
  const ticketsResolvedCount = (
    await issuesForSearchQuery(ticketsResolvedQuery, 0)
  ).total;

  return ticketsResolvedCount / nonBugTicketsCreatedCount;
};

const parseJiraResponse = (response: JiraApi.JsonResponse): TicketResponse => {
  // TODO parse the response using io-ts.
  return {
    issues: response.issues.map((issue: any) => issue.key),
    total: response.total,
  };
};

/**
 * Returns all tickets (issue keys) for the specified board in the specified status. Handles pagination with the Jira API and returns everything.
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
 * @return The expected number of tickets left to complete, as a range.
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
 * Run Monte Carlo simulations to predict the number of sprints it will take to complete
 * `ticketTarget` tickets.
 *
 * @param resolvedTicketCounts Each element is the number of tickets that were resolved in a
 *        particular week.
 * @param ticketTarget The number of tickets in the backlog (and in progress) ahead of the target
 *        ticket, plus one for the target ticket itself.
 * @return A Promise that resolves to an array of length `numSimulations` with one element for each
 *         simulation run. Each element is the number of sprints it took to complete `ticketTarget`
 *         tickets in that simulation.
 */
const simulations = async (
  resolvedTicketCounts: readonly number[],
  ticketTarget: number
): Promise<readonly number[]> => {
  const results: number[] = Array(numSimulations).fill(0);

  if (resolvedTicketCounts.every((x) => x === 0)) {
    // If every single one of our past sprints completed zero tickets, the loop below will never terminate.
    // So let's say all our "simulations" conclude that we will ship zero tickets this time too.
    return results;
  }

  // TODO: teach the simulation how to understand if some tickets are specialised and can only be worked on by certain people.
  for (let i = 0; i < numSimulations; i++) {
    let storiesDone = 0;
    while (storiesDone <= ticketTarget) {
      const numSprints = resolvedTicketCounts.length;
      storiesDone += resolvedTicketCounts[
        Math.floor(Math.random() * numSprints)
      ]!;
      results[i]++;
    }
  }

  return results;
};

const printPredictions = (
  lowTicketTarget: number,
  highTicketTarget: number,
  simulationResults: readonly number[]
): void => {
  console.log(
    `Number of sprints required to ship ${lowTicketTarget} to ${highTicketTarget} tickets:`
  );

  const percentages: Record<string, number> = {};
  const cumulativePercentages: Record<string, number> = {};
  let prevCumulativePercentage = 0;
  let resultAboveThreshold: string | undefined = undefined;

  // Count the number of simulations that arrived at each unique result. For example, if 3 of the
  // simulations predicted 17 sprints until the target ticket will be completed, 5 simulations
  // predicted 18 sprints and 2 predicted 19 sprints, then we'd end up with
  // numSimulationsPredicting[17] = 3
  // numSimulationsPredicting[18] = 5
  // numSimulationsPredicting[19] = 2
  const numSimulationsPredicting: Record<string, number> = {};
  for (const numSprintsPredicted of simulationResults) {
    numSimulationsPredicting[numSprintsPredicted] =
      (numSimulationsPredicting[numSprintsPredicted] ?? 0) + 1;
  }

  // This will give us the same array that nub(simulationResults) would, i.e. all duplicate
  // elements removed.
  const uniquePredictions = Object.keys(numSimulationsPredicting);

  // For each result (number of sprints) predicted by at least one of the simulations
  for (const numSprintsPredicted of uniquePredictions) {
    // Calculate the percentage of simulations that predicted this number of sprints.
    percentages[numSprintsPredicted] =
      ((numSimulationsPredicting[numSprintsPredicted] ?? 0) / numSimulations) *
      100;
    // And the percentage of simulations that predicted this number of sprints or fewer.
    cumulativePercentages[numSprintsPredicted] =
      (percentages[numSprintsPredicted] ?? 0) + prevCumulativePercentage;
    prevCumulativePercentage = cumulativePercentages[numSprintsPredicted] ?? 0;

    // Remember the lowest number of sprints that was predicted frequently enough to pass the
    // confidence threshold.
    if (
      !resultAboveThreshold &&
      (cumulativePercentages[numSprintsPredicted] ?? 0) >=
        confidencePercentageThreshold
    ) {
      resultAboveThreshold = numSprintsPredicted;
    }

    // Print the confidence (i.e. likelihood) we give for completing the tickets in this amount
    // of time.
    console.log(
      `${numSprintsPredicted} sprints (${
        Number(numSprintsPredicted) * sprintLengthInWeeks
      } weeks), ` +
        `${Math.floor(
          cumulativePercentages[numSprintsPredicted] ?? 0
        )}% confidence ` +
        `(predicted by ${numSimulationsPredicting[numSprintsPredicted]} simulation` +
        // Pluralise?
        `${numSimulationsPredicting[numSprintsPredicted] === 1 ? "" : "s"})`
    );
  }

  // Print the lowest prediction that passes the confidence threshold.
  console.log(
    `We are ${
      resultAboveThreshold
        ? Math.floor(cumulativePercentages[resultAboveThreshold] ?? 0)
        : "?"
    }% confident all ` +
      `${lowTicketTarget} to ${highTicketTarget} tickets will take no more than ${resultAboveThreshold} sprints (${
        Number(resultAboveThreshold) * sprintLengthInWeeks
      } weeks) to complete.`
  );
};

const main = async (): Promise<void> => {
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

  const board = await jira.getBoard(jiraBoardID);

  if (board.type === "scrum") {
      // TODO `getIssuesForBoard` doesn't appear to return tickets in a useful backlog order for scrum boards, so we have to do some work to support scrum boards.
      // See https://github.com/agiledigital-labs/probabilistic-forecast/issues/7
      throw new Error("Scrum boards are not (yet) supported.");
  }

  if (board.type !== "kanban") {
      throw new Error(`Unknown board type [${board.type}] for board [${jiraBoardID}].`);
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

  // TODO: Remove concept of sprints entirely? We should be able to just use days or weeks. See #2.
  console.log(`Sprint length is ${sprintLengthInWeeks} weeks`);
  console.log(
    `Fetching ticket counts for the last ${
      numWeeksOfHistory / sprintLengthInWeeks
    } sprints in ${jiraProjectID}...`
  );
  const resolvedTicketsPerSprint = await fetchResolvedTicketsPerSprint();

  await Promise.all(
    resolvedTicketsPerSprint.map(async (ticketsInSprint, idx) => {
      console.log(
        `Resolved ${ticketsInSprint.total} tickets in sprint ${idx + 1}:`
      );
      // Print the ticket IDs. This is useful if you're running simulations regularly and saving
      // the results.
      console.log(ticketsInSprint.issues.join(", "));
    })
  );

  console.log(`1 bug ticket created for every ${bugRatio} non-bug tickets.`);
  console.log(
    `1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`
  );
  console.log(
    `If the team continues to create new tickets at this rate, we predict the ${lowTicketTarget} outstanding tickets ` +
      `will have grown to ${highTicketTarget} tickets by the time they have all been completed.`
  );

  console.log(`Running ${numSimulations} simulations...`);
  const simulationResults = await simulations(
    resolvedTicketsPerSprint.map((tickets) => tickets.total),
    highTicketTarget
  );

  printPredictions(lowTicketTarget, highTicketTarget, simulationResults);
};

main();
