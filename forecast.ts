import JiraApi from 'jira-client';

const jiraHost = process.env.JIRA_HOST ?? "jira.agiledigital.com.au";
const jiraPort = process.env.JIRA_PORT;
const jiraProtocol = process.env.JIRA_PROTOCOL ?? "https";
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const jiraProjectID = process.env.JIRA_PROJECT_ID;
const jiraBoardID = process.env.JIRA_BOARD_ID;
const jiraTicketID = process.env.JIRA_TICKET_ID;
const numWeeksOfHistory = Number.parseInt(process.env.NUM_WEEKS_OF_HISTORY ?? '10');
const confidencePercentageThreshold = Number.parseInt(process.env.CONFIDENCE_PERCENTAGE_THRESHOLD ?? '80');
const numSimulations = Number.parseInt(process.env.NUM_SIMULATIONS ?? '1000');
const sprintLengthInWeeks = Number.parseInt(process.env.SPRINT_LENGTH_IN_WEEKS ?? '2');
const userSuppliedTicketTarget = Number.parseInt(process.env.TICKET_TARGET ?? '60');

const jira = new JiraApi({
  protocol: jiraProtocol,
  host: jiraHost,
  port: jiraPort,
  username: jiraUsername,
  password: jiraPassword,
  apiVersion: '2',
  strictSSL: true
});

type TicketResponse = {
    readonly total: number;
    readonly issues: ReadonlyArray<string>;
};

const issuesForSearchQuery = async (searchQuery: string, maxResults: number = 1000): Promise<TicketResponse> => {
    const issuesResp = await jira.searchJira(searchQuery, { maxResults });
    return parseJiraResponse(issuesResp);
};

// TODO: It would be better to use the date QA was completed for the ticket instead of the date the
//       ticket was resolved.
const fetchResolvedTicketsPerSprint = async () => {
    // We want to know how many tickets were completed during each sprint. To make things easier,
    // we're defining a sprint as just any period of two weeks.
    let historyStart = -sprintLengthInWeeks;
    let historyEnd = 0;
    const ticketCounts: Promise<number>[] = [];

    while (historyStart >= -1 * numWeeksOfHistory) {
        const query =
          `project = ${jiraProjectID} AND issuetype in standardIssueTypes() AND issuetype != Epic ` +
          `AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;

        ticketCounts.push(
            issuesForSearchQuery(query, 0).then(r => r.total)
        );

        historyStart -= sprintLengthInWeeks;
        historyEnd -= sprintLengthInWeeks;
    }

    return Promise.all(ticketCounts);
};

// "1 bug every X stories", which is probably the reciprocal of what you were expecting.
const fetchBugRatio = async (_jiraTicketID: string | undefined, _inProgress: TicketResponse, _toDo: TicketResponse) => {
    // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
    const bugsQuery = `project = ${jiraProjectID} AND issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const bugCount = (await issuesForSearchQuery(bugsQuery, 0)).total;

    // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
    const otherTicketsQuery = `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
      `AND issuetype != Epic AND issuetype != Fault AND created >= -${numWeeksOfHistory}w`;
    const otherTicketCount = (await issuesForSearchQuery(otherTicketsQuery, 0)).total;

    return otherTicketCount / bugCount;
};

// "1 new story [created] every X stories [resolved]"
const fetchDiscoveryRatio = async (_jiraTicketID: string | undefined, _inProgress: TicketResponse, _toDo: TicketResponse) => {
    // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
    const nonBugTicketsCreatedQuery = `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
      `AND issuetype != Epic AND issuetype != Fault AND created >= -${numWeeksOfHistory}w`;
    const nonBugTicketsCreatedCount = (await issuesForSearchQuery(nonBugTicketsCreatedQuery, 0)).total;

    const ticketsResolvedQuery = `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
      `AND issuetype != Epic AND resolved >= -${numWeeksOfHistory}w`;
    const ticketsResolvedCount = (await issuesForSearchQuery(ticketsResolvedQuery, 0)).total;

    return ticketsResolvedCount / nonBugTicketsCreatedCount;
};

const parseJiraResponse = (response: JiraApi.JsonResponse): TicketResponse => {
    // TODO parse the response using io-ts.
    return {
        issues: response.issues.map((issue: any) => issue.key),
        total: response.total
    }
};

/**
 * Returns all tickets (issue keys) for the specified board in the specified status. Handles pagination with the Jira API and returns everything.
 */
const issuesForBoard = async (jiraBoardID: string, statusCategory: "In Progress" | "To Do"): Promise<TicketResponse> => {
    // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
    const response = await jira.getIssuesForBoard(jiraBoardID, undefined, 1000, `issuetype in standardIssueTypes() and issuetype != Epic and statusCategory = "${statusCategory}"`);

    if (response.total > response.issues.length) {
        console.warn(`Some ${statusCategory} tickets excluded.`);
    }

    return parseJiraResponse(response);
};

/**
 * @return The expected number of tickets left to complete, as a range.
 */
const calculateTicketTarget = async (bugRatio: number, discoveryRatio: number, jiraBoardID: string | undefined, jiraTicketID: string | undefined, inProgress: TicketResponse, toDo: TicketResponse): Promise<{ lowTicketTarget: number, highTicketTarget: number}> => {
    let ticketTarget = userSuppliedTicketTarget;

    if (jiraBoardID !== undefined && jiraTicketID !== undefined) {
        const numberOfInProgressTickets = inProgress.total;
        const numberOfBacklogTicketsAboveTarget = toDo.issues.indexOf(jiraTicketID);
        if (numberOfBacklogTicketsAboveTarget === -1) {
            throw new Error(`Ticket ${jiraTicketID} not found in backlog for board ${jiraBoardID}`);
        }

        // + 1 to include the target ticket itself.
        ticketTarget = numberOfInProgressTickets + numberOfBacklogTicketsAboveTarget + 1;
        console.log(`${ticketTarget} total tickets until ${jiraTicketID} is to be completed (${numberOfInProgressTickets} in progress + ${numberOfBacklogTicketsAboveTarget} above in the backlog + ${jiraTicketID} itself)`);
    }

    // TODO: expand this to allow other sorts of targets in addition to a single Jira ticket ID.
    // Examples: "when will all tickets in epic x be done?", "when will all tickets with label y be done?"

    return {
        lowTicketTarget: ticketTarget,
        // Adjust to account for the new tickets we expect to be created during future development.
        highTicketTarget: Math.round(ticketTarget + ticketTarget / bugRatio + ticketTarget / discoveryRatio)
    };
};

const simulations = async (resolvedTicketCounts: readonly number[], ticketTarget: number): Promise<readonly number[]> => {
    const results: number[] = Array(numSimulations).fill(0);

    if (resolvedTicketCounts.every(x => x === 0)) {
        // If every single one of our past sprints completed zero tickets, the loop below will never terminate.
        // So let's say all our "simulations" conclude that we will ship zero tickets this time too.
        return results;
    }

    // TODO: teach the simulation how to understand if some tickets are specialised and can only be worked on by certain people.
    for (let i = 0; i < numSimulations; i++) {
        let storiesDone = 0;
        while (storiesDone <= ticketTarget) {
            const numSprints = resolvedTicketCounts.length;
            storiesDone += resolvedTicketCounts[Math.floor(Math.random() * numSprints)]!;
            results[i]++;
        }
    }

    return results;
};

const printPredictions = (lowTicketTarget: number, highTicketTarget: number, simulationResults: readonly number[]) => {
    console.log(`Number of sprints required to ship ${lowTicketTarget} to ${highTicketTarget} tickets ` +
      `(and the number of simulations that arrived at that result):`);

    const percentages: Record<string, number> = {};
    const cumulativePercentages: Record<string, number> = {};
    let prevCumulativePercentage = 0;
    let resultAboveThreshold: string | undefined = undefined;

    const uniqueResults: Record<string, number> = {};
    for (const result of simulationResults) {
        uniqueResults[result] = (uniqueResults[result] ?? 0) + 1;
    }

    const keys = Object.keys(uniqueResults);

    for (const uniqueResult of keys) {
        percentages[uniqueResult] = (uniqueResults[uniqueResult] ?? 0) / numSimulations * 100;
        cumulativePercentages[uniqueResult] = (percentages[uniqueResult] ?? 0) + prevCumulativePercentage;
        prevCumulativePercentage = cumulativePercentages[uniqueResult] ?? 0;

        if (!resultAboveThreshold && (cumulativePercentages[uniqueResult] ?? 0) >= confidencePercentageThreshold) {
            resultAboveThreshold = uniqueResult;
        }

        console.log(`${uniqueResult} sprints (${Number(uniqueResult) * sprintLengthInWeeks} weeks), ` +
          `${Math.floor(cumulativePercentages[uniqueResult] ?? 0)}% confidence ` +
          `(${uniqueResults[uniqueResult]} simulations)`);
    }

    console.log(`We are ${resultAboveThreshold ? Math.floor(cumulativePercentages[resultAboveThreshold] ?? 0) : '?'}% confident all ` +
      `${lowTicketTarget} to ${highTicketTarget} tickets will take no more than ${resultAboveThreshold} sprints (${Number(resultAboveThreshold) * sprintLengthInWeeks} weeks) to complete.`);
};

const main = async () => {
    if (jiraUsername === undefined || jiraPassword === undefined || jiraProjectID === undefined || jiraBoardID === undefined) {
        console.log("Usage: JIRA_PROJECT_ID=ADE JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start");
        return;
    }

    // TODO: if a ticket has a fix version it will no longer appear on the kanban even if it's still in progress. Such tickets will show up here even though we shouldn't consider them truly in progress or to do.
    const inProgress = await issuesForBoard(jiraBoardID, "In Progress");
    const toDo = await issuesForBoard(jiraBoardID, "To Do");
    const bugRatio = await fetchBugRatio(jiraTicketID, inProgress, toDo);
    const discoveryRatio = await fetchDiscoveryRatio(jiraTicketID, inProgress, toDo);
    const { lowTicketTarget, highTicketTarget } = await calculateTicketTarget(bugRatio, discoveryRatio, jiraBoardID, jiraTicketID, inProgress, toDo);

    // TODO: Remove concept of sprints entirely? We should be able to just use days or weeks.
    console.log(`Sprint length is ${sprintLengthInWeeks} weeks`);
    console.log(`Fetching ticket counts for the last ${numWeeksOfHistory / sprintLengthInWeeks} sprints in ${jiraProjectID}...`);
    const resolvedTicketCounts = await fetchResolvedTicketsPerSprint();

    resolvedTicketCounts.forEach(async (ticketCount, idx) => {
        // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
        //       didn't bother checking.
        console.log(`Resolved ${ticketCount} tickets in sprint ${idx + 1}.`);
    });

    console.log(`1 bug ticket created for every ${bugRatio} non-bug tickets.`);
    console.log(`1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`);
    console.log(`If the team continues to create new tickets at this rate, we predict the ${lowTicketTarget} outstanding tickets ` +
      `will have grown to ${highTicketTarget} tickets by the time they have all been completed.`);

    console.log(`Running ${numSimulations} simulations...`);
    const simulationResults = await simulations(resolvedTicketCounts, highTicketTarget);

    printPredictions(lowTicketTarget, highTicketTarget,  simulationResults);
};

main();
