# probabilistic-forecast

Jira plugin for probabilistic forecasting. (Currently just a command line script.)

[![Type Coverage](https://img.shields.io/badge/dynamic/json.svg?label=type-coverage&prefix=%E2%89%A5&suffix=%&query=$.typeCoverage.atLeast&uri=https%3A%2F%2Fraw.githubusercontent.com%2Fagiledigital-labs%2Fprobabilistic-forecast%2Fmaster%2Fpackage.json)](https://github.com/plantain-00/type-coverage)
![GitHub Workflow Status](https://img.shields.io/github/workflow/status/agiledigital-labs/probabilistic-forecast/Node.js%20CI)

[![dependencies Status](https://david-dm.org/agiledigital-labs/probabilistic-forecast/status.svg)](https://david-dm.org/agiledigital-labs/probabilistic-forecast)
[![devDependencies Status](https://david-dm.org/agiledigital-labs/probabilistic-forecast/dev-status.svg)](https://david-dm.org/agiledigital-labs/probabilistic-forecast?type=dev)
[![peerDependencies Status](https://david-dm.org/agiledigital-labs/probabilistic-forecast/peer-status.svg)](https://david-dm.org/agiledigital-labs/probabilistic-forecast?type=peer)

## Example Output

Let's say you have a ticket ADE-166 some way down your backlog. Let's say that ticket is in project ADE and the ID of the Jira board (kanban) is 74. ADE-166 represents the completion of a feature that you're interested in. You want to know when that feature will be ready. Here's what you do:

```
$ JIRA_PROJECT_ID="ADE" \
> JIRA_TICKET_ID="ADE-166" \
> JIRA_BOARD_ID="74" \
> JIRA_USERNAME=${JIRA_USERNAME} \
> JIRA_PASSWORD=${JIRA_PASSWORD} \
> npm run start
Counting tickets ahead of ADE-166 in your backlog...
27 total tickets ahead of ADE-166 (21 in progress + 6 to do)
Project interval is 2 weeks
Fetching ticket counts for the last 5 project intervals in ADE...
Resolved 5 tickets in project interval 1:
Ticket names...
Resolved 4 tickets in project interval 2:
Ticket names....
....................
1 bug ticket created for every 70 non-bug tickets.
1 new non-bug ticket created for every 0.8142857142857143 tickets resolved.
If the team continues to create new tickets at this rate, we predict the 27 outstanding tickets will have grown to 61 tickets by the time they have all been completed.
Running 1000 simulations...
Amount of time required to ship 27 to 61 tickets (and the number of simulations that arrived at that result):
84 days, 1% confidence (12 simulations)
98 days, 6% confidence (52 simulations)
112 days, 21% confidence (154 simulations)
126 days, 43% confidence (216 simulations)
140 days, 68% confidence (250 simulations)
154 days, 89% confidence (208 simulations)
168 days, 97% confidence (83 simulations)
182 days, 100% confidence (25 simulations)
We are 89% confident all 27 to 61 tickets will take no more than 154 days to complete.
```

## Other Environment Variables

- `NUM_WEEKS_OF_HISTORY`
  - The number of weeks of Jira history to use for the simulations and other
    predictions.
  - Default: 10
- `CONFIDENCE_PERCENTAGE_THRESHOLD`
  - The prediction with likelihood just above this level is highlighted in the output.
  - Default: 80
- `NUM_SIMULATIONS`
  - The number of rounds of Monte Carlo simulation to perform.
  - Default: 1000
- `SPRINT_LENGTH_IN_WEEKS`
  - The number of weeks in a sprint for the project.
  - Default: 2
- `TICKET_TARGET`
  - Will predict how long the team will take to complete this many tickets _from the current
    in-progress tickets_. This number will be adjusted to account for the rate of new tickets
    being created. Ignored if `JIRA_TICKET_ID` and `JIRA_BOARD_ID` are set.
  - Default: 60
- `BUG_RATIO`
  - Override the rate of bugs being discovered.
  - Will expect 1 bug ticket to be created for every `$BUG_RATIO` stories created.
  - Optional
- `DISCOVERY_RATIO`
  - Override the rate of new story tickets being created.
  - Will expect 1 story to be created for every `$DISCOVERY_RATIO` stories resolved.
  - Optional
- `TIME_LENGTH`
  - The amount of time for each project interval.
  - Default: 2
- `TIME_UNIT`
  - The unit of the project interval time. Can only be days or weeks at this stage.
  - Default: weeks

## Install

```
nvm use
npm ci
```

## Run

```
JIRA_PROJECT_ID=ABC JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
```

See `example-run.sh` to run interactively.

## Debug

```
NODE_OPTIONS="--inspect-brk" JIRA_PROJECT_ID=ABC JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
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
