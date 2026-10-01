import {
    QueryExecutionContext,
    type QueryUsageMetadata,
    type RunQueryTags,
} from '@lightdash/common';

/** Classify only explicit origins; a user UUID alone never implies human activity. */
export const queryWorkloadOrigin = (
    context: QueryExecutionContext,
    usage?: QueryUsageMetadata,
) => {
    if (usage?.schedulerId) return 'scheduled';
    switch (context) {
        case QueryExecutionContext.ALERT:
        case QueryExecutionContext.SCHEDULED_DELIVERY:
        case QueryExecutionContext.SCHEDULED_CHART:
        case QueryExecutionContext.SCHEDULED_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_CHART:
        case QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART:
            return 'scheduled';
        case QueryExecutionContext.AI:
            return 'agent';
        case QueryExecutionContext.MCP_RUN_METRIC_QUERY:
        case QueryExecutionContext.MCP_RUN_SQL:
        case QueryExecutionContext.MCP_SEARCH_FIELD_VALUES:
            return 'mcp';
        default:
            break;
    }
    if (usage?.appId) return 'app';
    switch (context) {
        case QueryExecutionContext.AUTOREFRESHED_DASHBOARD:
            return 'autorefresh';
        case QueryExecutionContext.DASHBOARD:
        case QueryExecutionContext.EXPLORE:
        case QueryExecutionContext.CHART:
        case QueryExecutionContext.CHART_HISTORY:
        case QueryExecutionContext.SQL_CHART:
        case QueryExecutionContext.SQL_RUNNER:
        case QueryExecutionContext.COMPOSE_SQL_RUNNER:
        case QueryExecutionContext.VIEW_UNDERLYING_DATA:
        case QueryExecutionContext.METRICS_EXPLORER:
            return 'interactive';
        default:
            return 'unknown';
    }
};

export const queryUsageProperties = (
    queryTags: RunQueryTags,
    usage?: QueryUsageMetadata,
) => {
    const now = Date.now();
    return {
        workloadOrigin: queryWorkloadOrigin(queryTags.query_context, usage),
        // Null on historical jobs. Never substitute warehouse time for response time.
        responseTimeMs:
            usage &&
            Number.isFinite(usage.startedAtMs) &&
            now >= usage.startedAtMs
                ? now - usage.startedAtMs
                : null,
        responseTimingBasis: usage?.timingBasis ?? null,
        dashboardTileId: usage?.dashboardTileId ?? null,
        appId: usage?.appId ?? null,
        appVersion: usage?.appVersion ?? null,
        requestId: usage?.requestId ?? null,
        parentOperationId: usage?.parentOperationId ?? null,
        initiatingActorType: usage?.actorType ?? null,
        schedulerId: usage?.schedulerId ?? null,
    };
};
