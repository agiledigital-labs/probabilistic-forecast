#!/bin/bash

#
# An example of a script you could use to run the project.
#

# Check Node.js version.
if [[ "$(node --version)" != "$(cat .nvmrc)" ]]; then
  echo "Warning: Run 'nvm use'." >/dev/stderr
fi

# Ask for Jira username and password.
if [[ -z "$JIRA_USERNAME" ]]; then
  echo "Jira username:"
  read -r JIRA_USERNAME
  export JIRA_USERNAME
fi

if [[ -z "$JIRA_PASSWORD" ]]; then
  echo "Jira password:"
  # See https://github.com/koalaman/shellcheck/wiki/SC2162#rationale
  IFS="" read -s -r JIRA_PASSWORD
  export JIRA_PASSWORD
fi

# Ask for the ticket ID and Kanban board ID.
if [[ -z "$JIRA_TICKET_ID" ]]; then
  echo "Jira ticket to forecast, e.g. PROJ-123:"
  read -r JIRA_TICKET_ID
  export JIRA_TICKET_ID
fi

if [[ -z "$JIRA_BOARD_ID" ]]; then
  echo "Jira Kanban board ID, e.g. 12 if the board URL was" \
    "https://your-jira/secure/RapidBoard.jspa?rapidView=12&projectKey=PROJ:"
  read -r JIRA_BOARD_ID
  export JIRA_BOARD_ID
fi

# Ask for the ticket creation rates.
if [[ -z "$BUG_RATIO" ]]; then
  echo "Override bug discovery ratio? Leave blank to calculate it automatically or e.g. 5 if you"\
    "expect to create 1 bug ticket for every 5 stories resolved:"
  read -r BUG_RATIO
  export BUG_RATIO
fi

if [[ -z "$DISCOVERY_RATIO" ]]; then
  echo "Override new story ratio? Leave blank to calculate it automatically or e.g. 10 if you"\
    "expect to create 1 story ticket for every 10 stories resolved:"
  read -r DISCOVERY_RATIO
  export DISCOVERY_RATIO
fi

if [[ -z "$TIME_LENGTH" ]]; then
  echo "The amount of time the project interval should be counted for (there will be a separate prompt for unit): "
  read -r TIME_LENGTH
  export TIME_LENGTH
fi

if [[ -z "$TIME_UNIT" ]]; then
  echo "The unit for the time interval ('weeks' or 'days', default is weeks): "
  read -r TIME_UNIT
  export TIME_UNIT
fi

# Output the command.
set -x

# Run the forecaster.
#
# Suppressed because we're only including JIRA_TICKET_ID so it will be printed, not changing it.
# shellcheck disable=SC2097 disable=SC2098
JIRA_USERNAME="$JIRA_USERNAME" \
  JIRA_PROJECT_ID="${JIRA_TICKET_ID%-*}" \
  JIRA_BOARD_ID="$JIRA_BOARD_ID" \
  JIRA_TICKET_ID="$JIRA_TICKET_ID" \
  BUG_RATIO="$BUG_RATIO" \
  DISCOVERY_RATIO="$DISCOVERY_RATIO" \
  TIME_LENGTH="$TIME_LENGTH" \
  TIME_UNIT="$TIME_UNIT" \
  npm run start
