import JiraApi from 'jira-client';

const jiraHost = process.env.JIRA_HOST || "jira.agiledigital.com.au";
const jiraPort = process.env.JIRA_PORT;
const jiraProtocol = process.env.JIRA_PROTOCOL || "https";
const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;
const jiraProjectID = process.env.JIRA_PROJECT_ID;
const jiraBoardID = process.env.JIRA_BOARD_ID;
const jiraTicketID = process.env.JIRA_TICKET_ID;

const jira = new JiraApi({
  protocol: jiraProtocol,
  host: jiraHost,
  port: jiraPort,
  username: jiraUsername,
  password: jiraPassword,
  apiVersion: '2',
  strictSSL: true
});

// TODO: Get these from user input.
const numWeeksOfHistory = 10;
const confidencePercentageThreshold = 80;
const numSimulations = 1000;
const sprintLengthInWeeks = 2;

const fetchIssueCount = async (searchQuery: string): Promise<number> => {
    // maxResults=0 because we only need the number of issues, which is included in the
    // metadata.
    const issuesResp = await jira.searchJira(searchQuery, {maxResults: 0});

    // TODO parse the response using io-ts.
    return issuesResp.total;
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
            `project = ${jiraProjectID} AND issuetype in standardIssueTypes() AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;

        ticketCounts.push(
            fetchIssueCount(query)
        );

        historyStart -= sprintLengthInWeeks;
        historyEnd -= sprintLengthInWeeks;
    }

    return Promise.all(ticketCounts);
};

// "1 bug every X stories", which is probably the reciprocal of what you were expecting.
const fetchBugRatio = async () => {
    const bugsQuery = `project = ${jiraProjectID} AND issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const bugCount = await fetchIssueCount(bugsQuery);

    // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
    const otherTicketsQuery = `project = ${jiraProjectID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const otherTicketCount = await fetchIssueCount(otherTicketsQuery);

    return otherTicketCount / bugCount;
};

// "1 new story [created] every X stories [resolved]"
const fetchDiscoveryRatio = async () => {
    const nonBugTicketsCreatedQuery = `project = ${jiraProjectID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const nonBugTicketsCreatedCount = await fetchIssueCount(nonBugTicketsCreatedQuery);

    const ticketsResolvedQuery = `project = ${jiraProjectID} AND resolved >= -${numWeeksOfHistory}w`;
    const ticketsResolvedCount = await fetchIssueCount(ticketsResolvedQuery);

    return ticketsResolvedCount / nonBugTicketsCreatedCount;
};

/**
 * @return The expected number of tickets left to complete, as a range.
 */
const calculateTicketTarget = async (bugRatio: number, discoveryRatio: number): Promise<{ lowTicketTarget: number, highTicketTarget: number}> => {
    // TODO: Don't hardcode the number of stories here.
    let ticketTarget = 60;

    if (jiraBoardID !== undefined && jiraTicketID !== undefined) {
        // TODO: handle pagination and get all results instead of assuming they will always be less than 100.
        const inProgress = await jira.getIssuesForBoard(jiraBoardID, undefined, 100, "statusCategory = \"In Progress\"");
        const toDo = await jira.getIssuesForBoard(jiraBoardID, undefined, 100, "statusCategory = \"To Do\"");

        const numberOfInProgressTickets = inProgress.issues.length;
        const numberOfBacklogTicketsAboveTarget = toDo.issues.map((issue: any) => issue.key).indexOf(jiraTicketID);
        if (numberOfBacklogTicketsAboveTarget === -1) {
            throw new Error(`Ticket ${jiraTicketID} not found in backlog for board ${jiraBoardID}`);
        }

        ticketTarget = numberOfInProgressTickets + numberOfBacklogTicketsAboveTarget;
        console.log(`${ticketTarget} total tickets ahead of ${jiraTicketID} (${numberOfInProgressTickets} in progress + ${numberOfBacklogTicketsAboveTarget} in backlog)`);
    }

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
        uniqueResults[result] = (uniqueResults[result] || 0) + 1;
    }

    const keys = Object.keys(uniqueResults);

    for (const uniqueResult of keys) {
        percentages[uniqueResult] = (uniqueResults[uniqueResult] || 0) / numSimulations * 100;
        cumulativePercentages[uniqueResult] = (percentages[uniqueResult] || 0) + prevCumulativePercentage;
        prevCumulativePercentage = cumulativePercentages[uniqueResult] || 0;

        if (!resultAboveThreshold && (cumulativePercentages[uniqueResult] || 0) >= confidencePercentageThreshold) {
            resultAboveThreshold = uniqueResult;
        }

        console.log(`${uniqueResult} sprints, ` +
          `${Math.floor(cumulativePercentages[uniqueResult] || 0)}% confidence ` +
          `(${uniqueResults[uniqueResult]} simulations)`);
    }

    console.log(`We are ${resultAboveThreshold ? Math.floor(cumulativePercentages[resultAboveThreshold] || 0) : '?'}% confident all ` +
      `${lowTicketTarget} to ${highTicketTarget} tickets will take no more than ${resultAboveThreshold} sprints to complete.`);
};

const main = async () => {
    if (jiraUsername === undefined || jiraPassword === undefined || jiraProjectID === undefined) {
        console.log("Usage: JIRA_PROJECT_ID=ADE JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start");
        return;
    }

    const bugRatio = await fetchBugRatio();
    const discoveryRatio = await fetchDiscoveryRatio();
    const { lowTicketTarget, highTicketTarget } = await calculateTicketTarget(bugRatio, discoveryRatio);

    console.log(`Sprint length is ${sprintLengthInWeeks} weeks`);
    console.log(`Fetching ticket counts for the last ${numWeeksOfHistory / 2} sprints in ${jiraProjectID}...`);
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
