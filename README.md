# probabilistic-forecast

Jira plugin for probabilistic forecasting. (Currently just a command line script.)

## Example Output

```
JIRA_PROJECT_ID="ADE" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID="74" JIRA_USERNAME=${JIRA_USERNAME} JIRA_PASSWORD=${JIRA_PASSWORD} npm run start                                                                  
28 total tickets ahead of ADE-166 (22 in progress + 6 in backlog)
Fetching ticket counts for the last 5 sprints in ADE...
Resolved 5 tickets in sprint 1.
Resolved 4 tickets in sprint 2.
Resolved 5 tickets in sprint 3.
Resolved 7 tickets in sprint 4.
Resolved 13 tickets in sprint 5.
1 bug ticket created for every 71 non-bug tickets.
1 new non-bug ticket created for every 0.8028169014084507 tickets resolved.
If the team continues to create new tickets at this rate, we predict the 28 outstanding tickets will have grown to 63 tickets by the time they have all been completed.
Running 1000 simulations...
Sprint length is 2 weeks
Number of sprints required to ship 28 to 63 tickets (and the number of simulations that arrived at that result):
6 sprints, 1% confidence (12 simulations)
7 sprints, 4% confidence (33 simulations)
8 sprints, 17% confidence (129 simulations)
9 sprints, 37% confidence (203 simulations)
10 sprints, 65% confidence (282 simulations)
11 sprints, 84% confidence (184 simulations)
12 sprints, 94% confidence (102 simulations)
13 sprints, 98% confidence (41 simulations)
14 sprints, 100% confidence (14 simulations)
We are 84% confident all 28 to 63 tickets will take no more than 11 sprints to complete.
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

## See Also

 - Inspired by the [Probabilistic Forecasting
   Spreadsheet](https://docs.google.com/spreadsheets/d/1L-BHVNIAFprYT0auzoBxvR3wI9JQS8wxVHG9XrDR1uQ)
   from <https://github.com/SkeltonThatcher/bizmetrics-book>.
