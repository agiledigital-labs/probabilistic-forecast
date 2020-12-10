# probabilistic-forecast

Jira plugin for probabilistic forecasting. (Currently just a command line script.)

[![Type Coverage](https://img.shields.io/badge/dynamic/json.svg?label=type-coverage&prefix=%E2%89%A5&suffix=%&query=$.typeCoverage.atLeast&uri=https%3A%2F%2Fraw.githubusercontent.com%2Fagiledigital-labs%2Fprobabilistic-forecast%2Fmaster%2Fpackage.json)](https://github.com/plantain-00/type-coverage)

## Example Output

Let's say you have a ticket ADE-166 some way down your backlog. Let's say that ticket is in project ADE and the ID of the Jira board (kanban) is 74. ADE-166 represents the completion of a feature that you're interested in. You want to know when that feature will be ready. Here's what you do:

```
> JIRA_PROJECT_ID="ADE" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID="74" JIRA_USERNAME=${JIRA_USERNAME} JIRA_PASSWORD=${JIRA_PASSWORD} npm run start                                                                  
27 total tickets ahead of ADE-166 (21 in progress + 6 to do)
Sprint length is 2 weeks
Fetching ticket counts for the last 5 sprints in ADE...
Resolved 5 tickets in sprint 1.
Resolved 4 tickets in sprint 2.
Resolved 5 tickets in sprint 3.
Resolved 7 tickets in sprint 4.
Resolved 13 tickets in sprint 5.
1 bug ticket created for every 70 non-bug tickets.
1 new non-bug ticket created for every 0.8142857142857143 tickets resolved.
If the team continues to create new tickets at this rate, we predict the 27 outstanding tickets will have grown to 61 tickets by the time they have all been completed.
Running 1000 simulations...
Number of sprints required to ship 27 to 61 tickets (and the number of simulations that arrived at that result):
6 sprints (12 weeks), 1% confidence (12 simulations)
7 sprints (14 weeks), 6% confidence (52 simulations)
8 sprints (16 weeks), 21% confidence (154 simulations)
9 sprints (18 weeks), 43% confidence (216 simulations)
10 sprints (20 weeks), 68% confidence (250 simulations)
11 sprints (22 weeks), 89% confidence (208 simulations)
12 sprints (24 weeks), 97% confidence (83 simulations)
13 sprints (26 weeks), 100% confidence (25 simulations)
We are 89% confident all 27 to 61 tickets will take no more than 11 sprints (22 weeks) to complete.
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
