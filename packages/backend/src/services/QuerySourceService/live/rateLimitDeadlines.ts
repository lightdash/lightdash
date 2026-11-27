import { assertUnreachable, QueryExecutionContext } from '@lightdash/common';

/**
 * How long a call may wait for its rate-limit turn, by who is waiting. Once
 * a call is sent, its own timeouts apply. Agents and MCP hear back sooner so
 * they can say when to retry; background jobs can wait out a short reset.
 */
export const LIVE_RATE_LIMIT_DEADLINES_MS = {
    interactive: 60_000,
    agent: 30_000,
    background: 120_000,
    sync: 30_000,
} as const;

export const getLiveRateLimitDeadlineMs = (
    context: QueryExecutionContext,
): number => {
    switch (context) {
        case QueryExecutionContext.AI:
        case QueryExecutionContext.MCP_RUN_METRIC_QUERY:
        case QueryExecutionContext.MCP_RUN_SQL:
        case QueryExecutionContext.MCP_SEARCH_FIELD_VALUES:
        case QueryExecutionContext.MCP_QUERY:
        case QueryExecutionContext.DATA_APP_SAMPLE:
            return LIVE_RATE_LIMIT_DEADLINES_MS.agent;
        case QueryExecutionContext.SCHEDULED_DELIVERY:
        case QueryExecutionContext.SCHEDULED_CHART:
        case QueryExecutionContext.SCHEDULED_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_CHART:
        case QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART:
        case QueryExecutionContext.ALERT:
        case QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION:
            return LIVE_RATE_LIMIT_DEADLINES_MS.background;
        case QueryExecutionContext.DASHBOARD:
        case QueryExecutionContext.AUTOREFRESHED_DASHBOARD:
        case QueryExecutionContext.EXPLORE:
        case QueryExecutionContext.FILTER_AUTOCOMPLETE:
        case QueryExecutionContext.CHART:
        case QueryExecutionContext.CHART_HISTORY:
        case QueryExecutionContext.SQL_CHART:
        case QueryExecutionContext.COMPOSER_CHART_VIEW:
        case QueryExecutionContext.SQL_RUNNER:
        case QueryExecutionContext.VIEW_UNDERLYING_DATA:
        case QueryExecutionContext.CSV:
        case QueryExecutionContext.GSHEETS:
        case QueryExecutionContext.GSHEETS_ADDON:
        case QueryExecutionContext.CALCULATE_TOTAL:
        case QueryExecutionContext.CALCULATE_SUBTOTAL:
        case QueryExecutionContext.EMBED:
        case QueryExecutionContext.API:
        case QueryExecutionContext.CLI:
        case QueryExecutionContext.METRICS_EXPLORER:
        case QueryExecutionContext.COMPOSE_SQL_RUNNER:
        case QueryExecutionContext.PYTHON_RUNNER:
        case QueryExecutionContext.MULTI_SOURCE_QUERY:
        case QueryExecutionContext.DESKTOP:
        case QueryExecutionContext.DATA_APP:
            return LIVE_RATE_LIMIT_DEADLINES_MS.interactive;
        default:
            return assertUnreachable(
                context,
                `Unknown query context ${context}`,
            );
    }
};
