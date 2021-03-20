import JiraApi from "jira-client";

export type TicketResponse = {
  readonly total: number;
  readonly issues: ReadonlyArray<string>;
};

type SprintResponse = {
  readonly maxResults: number;
  readonly startAt: number;
  readonly isLast: boolean;
  readonly values: ReadonlyArray<{
    readonly id: number;
    readonly state: "future" | "active" | "closed";
    readonly name: string;
  }>;
};

type BoardIssuesForSprintResponse = {
  readonly total: number;
  readonly issues: ReadonlyArray<{
    readonly key: string;
  }>;
};

export type JiraBoard = {
  readonly id: string;
  readonly type: "kanban" | "scrum";
};

/**
 * Parses to issue list and total number.
 *
 * @param response The query response from Jira API.
 * @returns An object consisting of issues and total count.
 */
const parseJiraResponse = (response: JiraApi.JsonResponse): TicketResponse => {
  // TODO parse the response using io-ts.
  return {
    issues: response.issues.map((issue: any) => issue.key),
    total: response.total,
  };
};

export const jiraClient = async (
  jiraHost: string,
  jiraPort: string | undefined,
  jiraProtocol: string | undefined,
  jiraUsername: string,
  jiraPassword: string,
  jiraProjectID: string,
  jiraBoardID: string,
  durationInDays: number,
  numDaysOfHistory: number,
  // TODO: these JQL queries exclude stalled tickets (and perhaps others) that we should consider as in progress / to do.
  inProgressOrToDoJql:
    | string
    | undefined = `issuetype in standardIssueTypes() and issuetype != Epic and statusCategory in ("To Do", "In Progress")`,
  kanbanInProgressJql: string | undefined = `statusCategory = "In Progress"`,
  kanbanToDoJql: string | undefined = `statusCategory = "To Do"`
) => {
  const jira = new JiraApi({
    protocol: jiraProtocol,
    host: jiraHost,
    port: jiraPort,
    username: jiraUsername,
    password: jiraPassword,
    apiVersion: "2",
    strictSSL: true,
  });

  const board = (await jira.getBoard(jiraBoardID)) as JiraBoard;

  if (board.type === "scrum") {
    // TODO `getIssuesForBoard` doesn't appear to return tickets in a useful backlog order for scrum boards, so we have to do some work to support scrum boards.
    // See https://github.com/agiledigital-labs/probabilistic-forecast/issues/7
    console.warn("Scrum boards are not (yet) supported.");
  }

  if (board.type !== "kanban" && board.type !== "scrum") {
    throw new Error(
      `Unknown board type [${board.type}] for board [${jiraBoardID}].`
    );
  }

  /**
   * Collects issues from Jira to analyse and facilitate prediction.
   *
   * @param searchQuery Query to retrieve data from Jira.
   * @param maxResults Maximum number of results to retrieve.
   * @returns The tickets retrieved from Jira.
   */
  const issuesForSearchQuery = async (
    searchQuery: string,
    maxResults: number = 1000
  ): Promise<TicketResponse> => {
    const issuesResp = await jira.searchJira(searchQuery, { maxResults });
    return parseJiraResponse(issuesResp);
  };

  return {
    // TODO: It would be better to use the date QA was completed for the ticket instead of the date the
    //       ticket was resolved.
    /**
     * Gets tickets resolved in each time interval cycle.
     *
     * @returns An array of number of tickets resolved in each time interval.
     */
    fetchResolvedTicketsPerTimeInterval: async () => {
      // We want to know how many tickets were completed during each time interval. If not defined,
      // our time interval is just any period of two weeks.
      let historyStart = -durationInDays;
      let historyEnd = 0;
      const ticketCounts: Promise<TicketResponse>[] = [];

      while (historyStart >= -1 * numDaysOfHistory) {
        const query =
          `project = ${jiraProjectID} AND issuetype in standardIssueTypes() AND issuetype != Epic ` +
          `AND resolved >= ${historyStart}d AND resolved <= ${historyEnd}d`;

        ticketCounts.push(issuesForSearchQuery(query));

        historyStart -= durationInDays;
        historyEnd -= durationInDays;
      }

      return Promise.all(ticketCounts);
    },
    /**
     * Gets the bug ratio for "1 bug every X stories" statement.
     * @returns Number of bugs per stories count.
     */
    fetchBugRatio: async () => {
      // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
      // See https://github.com/agiledigital-labs/probabilistic-forecast/issues/1
      const bugsQuery = `project = ${jiraProjectID} AND issuetype = Fault AND created >= -${numDaysOfHistory}d`;
      const bugCount = (await issuesForSearchQuery(bugsQuery, 0)).total;

      // Assuming the spreadsheet doesn't count bugs as stories, so exclude bugs in this query.
      const otherTicketsQuery =
        `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
        `AND issuetype != Epic AND issuetype != Fault AND created >= -${numDaysOfHistory}d`;
      const otherTicketCount = (
        await issuesForSearchQuery(otherTicketsQuery, 0)
      ).total;

      return otherTicketCount / bugCount;
    },
    /**
     * Gets the new story ratio for "1 new story [created] every X stories [resolved]" statement.
     * @returns Number of new stories created per resolved stories count.
     */
    fetchDiscoveryRatio: async () => {
      // TODO: this should only count created tickets if they are higher in the backlog than the target ticket or they are already in progress or done.
      // See https://github.com/agiledigital-labs/probabilistic-forecast/issues/1
      const nonBugTicketsCreatedQuery =
        `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
        `AND issuetype != Epic AND issuetype != Fault AND created >= -${numDaysOfHistory}d`;
      const nonBugTicketsCreatedCount = (
        await issuesForSearchQuery(nonBugTicketsCreatedQuery, 0)
      ).total;

      const ticketsResolvedQuery =
        `project = ${jiraProjectID} AND issuetype in standardIssueTypes() ` +
        `AND issuetype != Epic AND resolved >= -${numDaysOfHistory}d`;
      const ticketsResolvedCount = (
        await issuesForSearchQuery(ticketsResolvedQuery, 0)
      ).total;

      return ticketsResolvedCount / nonBugTicketsCreatedCount;
    },
    /**
     * Returns all tickets (issue keys) for the specified board in the specified status category.
     * Handles pagination with the Jira API and returns everything.
     *
     * @returns An object consisting of issues and total count.
     */
    issuesForBoard: async (): Promise<TicketResponse> => {
      if (board.type === "scrum") {
        // For scrum boards we have to get all (non-completed) tickets in all active sprints, then all (non-completed) tickets in all future sprints and finally all backlog tickets.
        const activeSprints = (await jira.getAllSprints(
          board.id,
          undefined,
          undefined,
          "active"
        )) as SprintResponse;
        const futureSprints = (await jira.getAllSprints(
          board.id,
          undefined,
          undefined,
          "future"
        )) as SprintResponse;

        const allSprintIDs = activeSprints.values
          .concat(futureSprints.values)
          .map((sprint) => sprint.id.toString());
        const currentAndFutureSprints = await Promise.all(
          allSprintIDs.map(
            (sprintID) =>
              // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
              jira.getBoardIssuesForSprint(
                board.id,
                sprintID,
                undefined,
                1000,
                inProgressOrToDoJql
              ) as Promise<BoardIssuesForSprintResponse>
          )
        );
        const currentAndFutureSprintTickets = currentAndFutureSprints.reduce(
          (previousValue, currentValue) => ({
            total: previousValue.total + currentValue.total,
            issues: previousValue.issues.concat(currentValue.issues),
          })
        );
        // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
        const backlogTickets = await jira.getIssuesForBacklog(
          board.id,
          undefined,
          1000,
          inProgressOrToDoJql
        );

        return {
          total: currentAndFutureSprintTickets.total + backlogTickets.total,
          issues: currentAndFutureSprintTickets.issues
            .concat(backlogTickets.issues)
            .map((issue) => issue.key),
        };
      } else {
        // For kanban boards we get all in progress tickets and all to do (backlog) tickets.
        // HACK: The Jira API won't let us use `getIssuesForBacklog` for kanban boards, so we first get in progress tickets, then "to do" tickets, then combine.

        // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
        const inProgressTickets = parseJiraResponse(
          await jira.getIssuesForBoard(
            board.id,
            undefined,
            1000,
            `(${inProgressOrToDoJql}) and (${kanbanInProgressJql})`
          )
        );

        // TODO: handle pagination and get all results instead of assuming they will always be less than 1000.
        const toDoTickets = parseJiraResponse(
          await jira.getIssuesForBoard(
            board.id,
            undefined,
            1000,
            `(${inProgressOrToDoJql}) and (${kanbanToDoJql})`
          )
        );

        return {
          total: inProgressTickets.total + toDoTickets.total,
          issues: inProgressTickets.issues.concat(toDoTickets.issues),
        };
      }
    },
  };
};
