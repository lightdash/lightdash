import assertUnreachable from '../utils/assertUnreachable';
import { QueryExecutionContext } from './analytics';

export enum QuerySurface {
    APP = 'app',
    AI_AGENT = 'ai_agent',
    SLACK_AGENT = 'slack_agent',
    MCP = 'mcp',
    API = 'api',
    SCHEDULE = 'schedule',
    EMBED = 'embed',
}

export enum QueryCredentialKind {
    SHARED = 'shared',
    PERSONAL = 'personal',
    AGENT = 'agent',
    COMPILE = 'compile',
}

export enum QueryRefusalReason {
    AI_ACCESS_OFF = 'ai_access_off',
    BLOCKED_FOR_AI = 'blocked_for_ai',
    RAW_SQL_OFF = 'raw_sql_off',
    CREDENTIAL_MISSING = 'credential_missing',
    CREDENTIAL_EXPIRED = 'credential_expired',
    NO_LIMITING_IDENTITY = 'no_limiting_identity',
}

export const getQuerySurface = (
    context: QueryExecutionContext,
    aiSurface: QuerySurface.AI_AGENT | QuerySurface.SLACK_AGENT | null,
): QuerySurface => {
    switch (context) {
        case QueryExecutionContext.MCP_RUN_METRIC_QUERY:
        case QueryExecutionContext.MCP_RUN_SQL:
        case QueryExecutionContext.MCP_SEARCH_FIELD_VALUES:
            return QuerySurface.MCP;
        case QueryExecutionContext.AI:
            return aiSurface ?? QuerySurface.AI_AGENT;
        case QueryExecutionContext.ALERT:
        case QueryExecutionContext.SCHEDULED_DELIVERY:
        case QueryExecutionContext.GSHEETS:
        case QueryExecutionContext.GSHEETS_ADDON:
        case QueryExecutionContext.SCHEDULED_GSHEETS_CHART:
        case QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD:
        case QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART:
        case QueryExecutionContext.SCHEDULED_CHART:
        case QueryExecutionContext.SCHEDULED_DASHBOARD:
        case QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION:
            return QuerySurface.SCHEDULE;
        case QueryExecutionContext.EMBED:
            return QuerySurface.EMBED;
        case QueryExecutionContext.API:
        case QueryExecutionContext.CLI:
            return QuerySurface.API;
        case QueryExecutionContext.DASHBOARD:
        case QueryExecutionContext.AUTOREFRESHED_DASHBOARD:
        case QueryExecutionContext.EXPLORE:
        case QueryExecutionContext.FILTER_AUTOCOMPLETE:
        case QueryExecutionContext.CHART:
        case QueryExecutionContext.CHART_HISTORY:
        case QueryExecutionContext.SQL_CHART:
        case QueryExecutionContext.SQL_RUNNER:
        case QueryExecutionContext.VIEW_UNDERLYING_DATA:
        case QueryExecutionContext.CSV:
        case QueryExecutionContext.CALCULATE_TOTAL:
        case QueryExecutionContext.CALCULATE_SUBTOTAL:
        case QueryExecutionContext.METRICS_EXPLORER:
        case QueryExecutionContext.COMPOSE_SQL_RUNNER:
        case QueryExecutionContext.MULTI_SOURCE_QUERY:
        case QueryExecutionContext.DATA_APP_SAMPLE:
            return QuerySurface.APP;
        default:
            return assertUnreachable(context, 'Unknown query context');
    }
};
