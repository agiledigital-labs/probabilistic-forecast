#!/usr/bin/env node

const fetch = require('node-fetch');

// TODO: Get these from user input.
const projectJiraID = 'QFXFB';
const numWeeksOfHistory = 6;

const jiraUrl = 'https://jira.agiledigital.com.au';
const apiUrl = `${jiraUrl}/rest/api/2`;

const sessionID = process.env.JSESSIONID;

const fetchIssueCount = async (searchQuery) => {
    const encodedQuery = encodeURIComponent(searchQuery);

    return fetch(
        // maxResults=0 because we only need the number of issues, which is included in the
        // metadata.
        `${apiUrl}/search?jql=${encodedQuery}&maxResults=0`,
        {
            "credentials": "include",
            "headers": {
                'X-Atlassian-Token': 'no-check',
                'Cookie': `JSESSIONID=${sessionID}`
            },
            "method": "GET",
            "mode": "cors"
        });
};

const fetchResolvedTickets = async () => {
    // We want to know how many tickets were completed during each sprint. To make things easier,
    // we're defining a sprint as just any period of two weeks.
    let historyStart = -2;
    let historyEnd = 0;
    let resolvedTicketsSearches = [];

    while (historyStart >= -1 * numWeeksOfHistory) {
        const query = 
            `project = ${projectJiraID} AND issuetype in standardIssueTypes() AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;

        resolvedTicketsSearches.push(
            fetchIssueCount(query)
        );

        historyStart -= 2;
        historyEnd -= 2;
    }

    console.log('Fetching tickets...');
    return Promise.all(resolvedTicketsSearches);
};

const main = async () => {
    const resolvedTickets = await fetchResolvedTickets();

    resolvedTickets.forEach(async (ticket, idx) => {
        const ticketJson = await ticket.json();
        // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
        //       didn't bother checking.
        console.log(`Resolved ${ticketJson.total} tickets in sprint ${idx + 1}.`);
    });
};

main();
