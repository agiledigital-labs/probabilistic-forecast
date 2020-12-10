import JiraApi from 'jira-client';

const jiraUsername = process.env.JIRA_USERNAME;
const jiraPassword = process.env.JIRA_PASSWORD;

var jira = new JiraApi({
  protocol: 'https',
  host: process.env.JIRA_HOST || 'jira.agiledigital.com.au',
  username: jiraUsername,
  password: jiraPassword,
  apiVersion: '2',
  strictSSL: true
});

// TODO: Get these from user input.
const projectJiraID = 'QFXFB';
const numWeeksOfHistory = 6;

const numSimulations = 1000;

// TODO: Don't hardcode the number of stories here.
const ticketTarget = 60;

const fetchIssueCount = async (searchQuery: string): Promise<number> => {
    // maxResults=0 because we only need the number of issues, which is included in the
    // metadata.
    const issuesResp = await jira.searchJira(searchQuery, {maxResults: 0})

    // TODO parse the response using io-ts.
    return issuesResp.total;
};

// TODO: It would be better to use the date QA was completed for the ticket instead of the date the
//       ticket was resolved.
const fetchResolvedTicketsPerSprint = async () => {
    // We want to know how many tickets were completed during each sprint. To make things easier,
    // we're defining a sprint as just any period of two weeks.
    let historyStart = -2;
    let historyEnd = 0;
    const ticketCounts = [];

    while (historyStart >= -1 * numWeeksOfHistory) {
        const query = 
            `project = ${projectJiraID} AND issuetype in standardIssueTypes() AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;

        ticketCounts.push(
            fetchIssueCount(query)
        );

        historyStart -= 2;
        historyEnd -= 2;
    }

    return Promise.all(ticketCounts);
};

// "1 bug every X stories", which is probably the reciprocal of what you were expecting.
const fetchBugRatio = async () => {
    const bugsQuery = `project = ${projectJiraID} AND issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const bugCount = await fetchIssueCount(bugsQuery);

    // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
    const otherTicketsQuery = `project = ${projectJiraID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const otherTicketCount = await fetchIssueCount(otherTicketsQuery);

    return otherTicketCount / bugCount;
};

// "1 new story [created] every X stories [resolved]"
const fetchDiscoveryRatio = async () => {
    const nonBugTicketsCreatedQuery = `project = ${projectJiraID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const nonBugTicketsCreatedCount = await fetchIssueCount(nonBugTicketsCreatedQuery);

    const ticketsResolvedQuery = `project = ${projectJiraID} AND resolved >= -${numWeeksOfHistory}w`;
    const ticketsResolvedCount = await fetchIssueCount(ticketsResolvedQuery);

    return ticketsResolvedCount / nonBugTicketsCreatedCount;
};

const simulations = async (resolvedTicketCounts: readonly number[], ticketTarget: number): Promise<readonly number[]> => {
    const results = Array(numSimulations).fill(0);

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

const main = async () => {
    if (jiraUsername === undefined || jiraPassword === undefined) {
        console.log("Usage: JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start");
        return;
    }

    console.log('Fetching ticket counts...');
    const resolvedTicketCounts = await fetchResolvedTicketsPerSprint();

    // TODO: Incorporate these in the simulation.
    const bugRatio = await fetchBugRatio();
    const discoveryRatio = await fetchDiscoveryRatio();

    resolvedTicketCounts.forEach(async (ticketCount, idx) => {
        // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
        //       didn't bother checking.
        console.log(`Resolved ${ticketCount} tickets in sprint ${idx + 1}.`);
    });

    console.log(`1 bug for every ${bugRatio} non-bug tickets.`);
    console.log(`1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`);

    console.log(`Running ${numSimulations} simulations...`);
    const simulationResults = await simulations(resolvedTicketCounts, ticketTarget);

    const uniqueResults: Record<string, number> = {};
    for (const result of simulationResults) {
        uniqueResults[result] = (uniqueResults[result] || 0) + 1;
    }

    const keys = Object.keys(uniqueResults);

    // TODO: Output likely case given some user-specified confidence threshold.
    console.log(`Number of sprints required to ship ${ticketTarget} tickets (and the number of simulations that arrived at that result):`);
    console.log(`Best case: ${keys[0]}`);
    console.log(`Worst case: ${keys[keys.length-1]}`);
    console.log(`Details:`);
    for (const uniqueResult of keys) {
        console.log(`${uniqueResult} sprints (${uniqueResults[uniqueResult]} simulations)`);
    }
};

main();
