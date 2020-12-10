# probabilistic-forecast

Jira plugin for probabilistic forecasting. (Currently just a command line script.)

## Example Output

```
JIRA_PROJECT_ID="ADE" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID="74" JIRA_USERNAME=${JIRA_USERNAME} JIRA_PASSWORD=${JIRA_PASSWORD} npm run start                                                                  
28 total tickets ahead of ADE-166 (22 in progress + 6 in backlog)
Fetching ticket counts for the last 5 sprints in ADE...
Resolved 5 tickets in sprint 1.
Resolved 5 tickets in sprint 2.
Resolved 4 tickets in sprint 3.
Resolved 7 tickets in sprint 4.
Resolved 13 tickets in sprint 5.
1 bug for every 73 non-bug tickets.
1 new non-bug ticket created for every 0.7808219178082192 tickets resolved.
Running 1000 simulations...
Sprint length is 2 weeks
Number of sprints required to ship 28 tickets (and the number of simulations that arrived at that result):
3 sprints, 9% confidence (91 simulations)
4 sprints, 40% confidence (314 simulations)
5 sprints, 74% confidence (342 simulations)
6 sprints, 95% confidence (209 simulations)
7 sprints, 100% confidence (44 simulations)
We are 95% confident all 28 tickets will take no more than 6 sprints to complete.
```

## Install

```
nvm use
npm ci
```

## Run

```
JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
```

## Debug

```
NODE_OPTIONS="--inspect-brk" JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
```

Then open Chrome dev tools and click the NodeJS icon.

## Before Pushing

```
npm run type-coverage
```