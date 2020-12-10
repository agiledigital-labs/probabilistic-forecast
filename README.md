# probabilistic-forecast

Jira plugin for probabilistic forecasting. (Currently just a command line script.)

## Example Output

```
JIRA_PROJECT_ID="ADE" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID="74" JIRA_USERNAME=${JIRA_USERNAME} JIRA_PASSWORD=${JIRA_PASSWORD} npm run start                                                                  
27 total tickets ahead of ADE-166 (21 in progress + 6 to do)
Sprint length is 2 weeks
Fetching ticket counts for the last 5 sprints in ADE...
Resolved 5 tickets in sprint 1.
Resolved 4 tickets in sprint 2.
Resolved 5 tickets in sprint 3.
Resolved 7 tickets in sprint 4.
Resolved 13 tickets in sprint 5.
1 bug ticket created for every 71 non-bug tickets.
1 new non-bug ticket created for every 0.8028169014084507 tickets resolved.
If the team continues to create new tickets at this rate, we predict the 27 outstanding tickets will have grown to 61 tickets by the time they have all been completed.
Running 1000 simulations...
Number of sprints required to ship 27 to 61 tickets (and the number of simulations that arrived at that result):
6 sprints, 1% confidence (17 simulations)
7 sprints, 6% confidence (51 simulations)
8 sprints, 22% confidence (160 simulations)
9 sprints, 48% confidence (252 simulations)
10 sprints, 73% confidence (256 simulations)
11 sprints, 90% confidence (168 simulations)
12 sprints, 97% confidence (70 simulations)
13 sprints, 99% confidence (24 simulations)
14 sprints, 100% confidence (2 simulations)
We are 90% confident all 27 to 61 tickets will take no more than 11 sprints (22 weeks) to complete.
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
