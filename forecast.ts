#!/usr/bin/env node

import fetch from 'node-fetch';

// TODO: Get these from user input.
const projectJiraID = 'QFXFB';
const numWeeksOfHistory = 6;

const numSimulations = 1000;

const jiraUrl = 'https://jira.agiledigital.com.au';
const apiUrl = `${jiraUrl}/rest/api/2`;

const sessionID = process.env.JSESSIONID;

const fetchIssueCount = async (searchQuery: string): Promise<number> => {
    const encodedQuery = encodeURIComponent(searchQuery);

    return fetch(
        // maxResults=0 because we only need the number of issues, which is included in the
        // metadata.
        `${apiUrl}/search?jql=${encodedQuery}&maxResults=0`,
        {
            "headers": {
                'X-Atlassian-Token': 'no-check',
                'Cookie': `JSESSIONID=${sessionID}`
            },
            "method": "GET",
        })
        .then(issuesResp => issuesResp.json())
        .then(issues => issues.total);
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

const simulations = async (resolvedTicketCounts: readonly number[]) => {
    const results = Array(numSimulations).fill(0);

    for (let i = 0; i < numSimulations; i++) {
        let storiesDone = 0;

        // TODO: Don't hardcode the number of stories here.
        while (storiesDone <= 60) {
            const numSprints = resolvedTicketCounts.length;
            storiesDone += resolvedTicketCounts[Math.floor(Math.random() * numSprints)]!;
            results[i]++;
        }
    }

    return results;
};

const main = async () => {
    console.log('Fetching ticket counts...');
    const resolvedTicketCounts = await fetchResolvedTicketsPerSprint();
    const bugRatio = await fetchBugRatio();
    const discoveryRatio = await fetchDiscoveryRatio();

    resolvedTicketCounts.forEach(async (ticketCount, idx) => {
        // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
        //       didn't bother checking.
        console.log(`Resolved ${ticketCount} tickets in sprint ${idx + 1}.`);
    });

    console.log(`1 bug for every ${bugRatio} non-bug tickets.`);
    console.log(`1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`);

    console.log('Running simulations...');
    const simulationResults = simulations(resolvedTicketCounts);
    console.log(simulationResults);
};

main();
