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
$ JIRA_HOST="example.com" \
> JIRA_TICKET_ID="ADE-166" \
> JIRA_BOARD_ID="74" \
> JIRA_USERNAME=${JIRA_USERNAME} \
> JIRA_PASSWORD=${JIRA_PASSWORD} \
> npm run start
Connecting to Jira and getting board 74.
Counting tickets ahead of ADE-166 in board 74...
There are 86 tickets in board 74 that are either in progress or still to do. Of those, 30 tickets are ahead of ADE-166 in priority order.
Project interval is 2 weeks
The team's past performance will be measured based on tickets in project(s) ADE that have been resolved in the last 5 project intervals (70 days of history will be considered in total).
Resolved 2 tickets in project interval 1:
<snip>
Resolved 2 tickets in project interval 2:
<snip>
Resolved 7 tickets in project interval 3:
<snip>
Resolved 5 tickets in project interval 4:
<snip>
Resolved 11 tickets in project interval 5:
<snip>
1 bug ticket created for every 6.8 non-bug tickets.
1 new non-bug ticket created for every 0.7941176470588235 tickets resolved.
If the team continues to create new tickets at this rate, we predict the 31 outstanding tickets will have grown to 75 tickets by the time they have all been completed.
Running 1000 simulations...
Amount of time required to ship 31 to 75 tickets (and the number of simulations that arrived at that result):
126 days, 0% confidence (5 simulations)
140 days, 3% confidence (29 simulations)
154 days, 8% confidence (53 simulations)
168 days, 19% confidence (111 simulations)
182 days, 35% confidence (158 simulations)
196 days, 50% confidence (146 simulations)
210 days, 65% confidence (152 simulations)
224 days, 78% confidence (128 simulations)
238 days, 87% confidence (93 simulations)
252 days, 93% confidence (56 simulations)
266 days, 97% confidence (43 simulations)
280 days, 98% confidence (14 simulations)
294 days, 99% confidence (8 simulations)
308 days, 99% confidence (4 simulations)
We are 87% confident all 31 to 75 tickets will take no more than 238 days to complete.
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
JIRA_TICKET_ID="ADE-166" JIRA_HOST="example.com" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
```

See `example-run.sh` to run interactively.

## Debug

```
NODE_OPTIONS="--inspect-brk" JIRA_HOST="example.com" JIRA_TICKET_ID="ADE-166" JIRA_BOARD_ID=74 JIRA_USERNAME=foo JIRA_PASSWORD=bar npm run start
```

Then open Chrome dev tools and click the NodeJS icon.

## Before Pushing

```
npm run format && npm run type-coverage
```

## See Also

- Inspired by the [Probabilistic Forecasting
  Spreadsheet](https://docs.google.com/spreadsheets/d/1L-BHVNIAFprYT0auzoBxvR3wI9JQS8wxVHG9XrDR1uQ)
  from <https://github.com/SkeltonThatcher/bizmetrics-book>.
