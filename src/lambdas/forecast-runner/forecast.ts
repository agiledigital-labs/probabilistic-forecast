import { TicketResponse } from "../../services/jira";

/**
 * Estimates the number of tickets to complete before getting to the supplied ticket.
 *
 * @param bugRatio Number of bugs per ticket.
 * @param discoveryRatio Number of new tickets per resolved ticket.
 * @param jiraBoardID ID of the Kanban board.
 * @param jiraTicketID ID of the Jira ticket to forecast.
 * @param inProgress Current in-progress tickets.
 * @param toDo Current to-do tickets.
 * @returns The expected number of tickets left to complete, as a range.
 */
export const calculateTicketTarget = async (
  bugRatio: number,
  discoveryRatio: number,
  jiraBoardID: string,
  jiraTicketID: string,
  tickets: TicketResponse,
  userSuppliedTicketTarget: number
): Promise<{
  numberOfTicketsAboveTarget: number;
  lowTicketTarget: number;
  highTicketTarget: number;
}> => {
  let ticketTarget = userSuppliedTicketTarget;

  const numberOfTicketsAboveTarget = tickets.issues.indexOf(jiraTicketID);
  if (numberOfTicketsAboveTarget === -1) {
    throw new Error(
      `Ticket ${jiraTicketID} not found in ticket list for board ${jiraBoardID}`
    );
  }

  // + 1 to include the target ticket itself.
  ticketTarget = numberOfTicketsAboveTarget + 1;

  // TODO: expand this to allow other sorts of targets in addition to a single Jira ticket ID.
  // Examples: "when will all tickets in epic x be done?", "when will all tickets with label y be done?"

  return {
    numberOfTicketsAboveTarget: numberOfTicketsAboveTarget,
    lowTicketTarget: ticketTarget,
    // Adjust to account for the new tickets we expect to be created during future development.
    // TODO: Should we use a compounding formula to account for tickets that get created and
    //       then cause new tickets themselves, e.g. bugs introduced by the new features? If so,
    //       should we treat the two ratios differently, since more bugs tend to be created by
    //       feature tickets and bugs usually don't take as long as features?
    highTicketTarget: Math.round(
      ticketTarget + ticketTarget / bugRatio + ticketTarget / discoveryRatio
    ),
  };
};

/**
 * Run Monte Carlo simulations to predict the number of time intervals it will take to complete
 * `ticketTarget` tickets.
 *
 * @param resolvedTicketCounts Each element is the number of tickets that were resolved in a
 *        particular week.
 * @param ticketTarget The number of tickets in the backlog (and in progress) ahead of the target
 *        ticket, plus one for the target ticket itself.
 * @return A Promise that resolves to an array of length `numSimulations` with one element for each
 *         simulation run. Each element is the number of time intervals it took to complete `ticketTarget`
 *         tickets in that simulation.
 */
export const simulations = async (
  resolvedTicketCounts: readonly number[],
  ticketTarget: number,
  numSimulations: number
): Promise<readonly number[]> => {
  const results: number[] = Array(numSimulations).fill(0);

  if (resolvedTicketCounts.every((x) => x === 0)) {
    // If every single one of our past time intervals completed zero tickets, the loop below will never terminate.
    // So let's say all our "simulations" conclude that we will ship zero tickets this time too.
    return results;
  }

  // TODO: teach the simulation how to understand if some tickets are specialised and can only be worked on by certain people.
  for (let i = 0; i < numSimulations; i++) {
    let storiesDone = 0;
    while (storiesDone <= ticketTarget) {
      const numTimeIntervals = resolvedTicketCounts.length;
      storiesDone +=
        resolvedTicketCounts[Math.floor(Math.random() * numTimeIntervals)]!;
      // @ts-ignore
      results[i]++;
    }
  }

  return results;
};

/**
 * Prints the predictions realized in relation to the supplied ticket.
 *
 * @param lowTicketTarget Minimum number of tickets to complete.
 * @param highTicketTarget Maximum number of tickets to complete.
 * @param simulationResults Simulation outcomes.
 */
export const getPredictionReport = (
  lowTicketTarget: number,
  highTicketTarget: number,
  simulationResults: readonly number[],
  numSimulations: number,
  confidencePercentageThreshold: number,
  durationInDays: number
) => {
  const reportTitle =`Amount of time required to ship ${lowTicketTarget} to ${highTicketTarget} tickets ` +
      `(and the number of simulations that arrived at that result):`;

  const percentages: Record<string, number> = {};
  const cumulativePercentages: Record<string, number> = {};
  let prevCumulativePercentage = 0;
  let resultAboveThreshold: string | undefined = undefined;

  // Count the number of simulations that arrived at each unique result. For example, if 3 of the
  // simulations predicted 17 time intervals until the target ticket will be completed, 5 simulations
  // predicted 18 time intervals and 2 predicted 19 time intervals, then we'd end up with
  // numSimulationsPredicting[17] = 3
  // numSimulationsPredicting[18] = 5
  // numSimulationsPredicting[19] = 2
  const numSimulationsPredicting: Record<string, number> = {};
  for (const result of simulationResults) {
    numSimulationsPredicting[result] =
      (numSimulationsPredicting[result] ?? 0) + 1;
  }

  // This will give us the same array that nub(simulationResults) would, i.e. all duplicate
  // elements removed.
  const uniquePredictions = Object.keys(numSimulationsPredicting);

  // For each result (number of time intervals) predicted by at least one of the simulations
  const uniquePredictionReport = uniquePredictions.reduce((acc, numIntervalsPredicted) => {
    percentages[numIntervalsPredicted] =
      ((numSimulationsPredicting[numIntervalsPredicted] ?? 0) /
        numSimulations) *
      100;
    // And the percentage of simulations that predicted this number of time intervals or fewer.
    cumulativePercentages[numIntervalsPredicted] =
      (percentages[numIntervalsPredicted] ?? 0) + prevCumulativePercentage;
    prevCumulativePercentage =
      cumulativePercentages[numIntervalsPredicted] ?? 0;

    // Remember the lowest number of time interval that was predicted frequently enough
    // to pass the confidence threshold.
    if (
      !resultAboveThreshold &&
      (cumulativePercentages[numIntervalsPredicted] ?? 0) >=
        confidencePercentageThreshold
    ) {
      resultAboveThreshold = numIntervalsPredicted;
    }

    // Print the confidence (i.e. likelihood) we give for completing the tickets in this amount
    // of time.
    const reportText = `${Number(numIntervalsPredicted) * durationInDays} days, ` +
        `${Math.floor(
          cumulativePercentages[numIntervalsPredicted] ?? 0
        )}% confidence ` +
        `(${numSimulationsPredicting[numIntervalsPredicted]} simulation` +
        // Pluralize
        `${numSimulationsPredicting[numIntervalsPredicted] === 1 ? "" : "s"})`;

    return `${acc}\n${reportText}`;
  }, "");

  const finalReport = `We are ${
      resultAboveThreshold
        ? Math.floor(cumulativePercentages[resultAboveThreshold] ?? 0)
        : "?"
    }% confident all ` +
      `${lowTicketTarget} to ${highTicketTarget} tickets will take no more than ${
        Number(resultAboveThreshold) * durationInDays
      } days to complete.`;

  return `${reportTitle}\n\n${uniquePredictionReport}\n\n${finalReport}`;
};
