#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fetch_1 = __importDefault(require("node-fetch"));
// TODO: Get these from user input.
const projectJiraID = 'QFXFB';
const numWeeksOfHistory = 6;
const numSimulations = 1000;
const jiraUrl = 'https://jira.agiledigital.com.au';
const apiUrl = `${jiraUrl}/rest/api/2`;
const sessionID = process.env.JSESSIONID;
const fetchIssueCount = (searchQuery) => __awaiter(void 0, void 0, void 0, function* () {
    const encodedQuery = encodeURIComponent(searchQuery);
    return node_fetch_1.default(
    // maxResults=0 because we only need the number of issues, which is included in the
    // metadata.
    `${apiUrl}/search?jql=${encodedQuery}&maxResults=0`, {
        "headers": {
            'X-Atlassian-Token': 'no-check',
            'Cookie': `JSESSIONID=${sessionID}`
        },
        "method": "GET",
    })
        .then(issuesResp => issuesResp.json())
        .then(issues => issues.total);
});
// TODO: It would be better to use the date QA was completed for the ticket instead of the date the
//       ticket was resolved.
const fetchResolvedTicketsPerSprint = () => __awaiter(void 0, void 0, void 0, function* () {
    // We want to know how many tickets were completed during each sprint. To make things easier,
    // we're defining a sprint as just any period of two weeks.
    let historyStart = -2;
    let historyEnd = 0;
    let ticketCounts = [];
    while (historyStart >= -1 * numWeeksOfHistory) {
        const query = `project = ${projectJiraID} AND issuetype in standardIssueTypes() AND resolved >= ${historyStart}w AND resolved <= ${historyEnd}w`;
        ticketCounts.push(fetchIssueCount(query));
        historyStart -= 2;
        historyEnd -= 2;
    }
    return Promise.all(ticketCounts);
});
// "1 bug every X stories", which is probably the reciprocal of what you were expecting.
const fetchBugRatio = () => __awaiter(void 0, void 0, void 0, function* () {
    const bugsQuery = `project = ${projectJiraID} AND issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const bugCount = yield fetchIssueCount(bugsQuery);
    // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
    const otherTicketsQuery = `project = ${projectJiraID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const otherTicketCount = yield fetchIssueCount(otherTicketsQuery);
    return otherTicketCount / bugCount;
});
// "1 new story [created] every X stories [resolved]"
const fetchDiscoveryRatio = () => __awaiter(void 0, void 0, void 0, function* () {
    const nonBugTicketsCreatedQuery = `project = ${projectJiraID} AND NOT issuetype = Fault AND created >= -${numWeeksOfHistory}w`;
    const nonBugTicketsCreatedCount = yield fetchIssueCount(nonBugTicketsCreatedQuery);
    const ticketsResolvedQuery = `project = ${projectJiraID} AND resolved >= -${numWeeksOfHistory}w`;
    const ticketsResolvedCount = yield fetchIssueCount(ticketsResolvedQuery);
    return ticketsResolvedCount / nonBugTicketsCreatedCount;
});
const simulations = (resolvedTicketCounts) => __awaiter(void 0, void 0, void 0, function* () {
    const results = Array(numSimulations).fill(0);
    for (let i = 0; i < numSimulations; i++) {
        let storiesDone = 0;
        // TODO: Don't hardcode the number of stories here.
        while (storiesDone <= 60) {
            const numSprints = resolvedTicketCounts.length;
            storiesDone += resolvedTicketCounts[Math.floor(Math.random() * numSprints)];
            results[i]++;
        }
    }
    return results;
});
const main = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Fetching ticket counts...');
    const resolvedTicketCounts = yield fetchResolvedTicketsPerSprint();
    const bugRatio = yield fetchBugRatio();
    const discoveryRatio = yield fetchDiscoveryRatio();
    resolvedTicketCounts.forEach((ticketCount, idx) => __awaiter(void 0, void 0, void 0, function* () {
        // TODO: Not sure these will be in order. I don't think it matters to the simulation, so I
        //       didn't bother checking.
        console.log(`Resolved ${ticketCount} tickets in sprint ${idx + 1}.`);
    }));
    console.log(`1 bug for every ${bugRatio} non-bug tickets.`);
    console.log(`1 new non-bug ticket created for every ${discoveryRatio} tickets resolved.`);
    console.log('Running simulations...');
    const simulationResults = simulations(resolvedTicketCounts);
    console.log(simulationResults);
});
main();
