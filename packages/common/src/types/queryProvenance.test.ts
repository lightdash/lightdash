import { describe, expect, it } from 'vitest';
import { QueryExecutionContext } from './analytics';
import {
    getQuerySurface,
    QueryCredentialKind,
    QueryRefusalReason,
    QuerySurface,
} from './queryProvenance';

describe('getQuerySurface', () => {
    const expected: Record<QueryExecutionContext, QuerySurface> = {
        [QueryExecutionContext.DASHBOARD]: QuerySurface.APP,
        [QueryExecutionContext.AUTOREFRESHED_DASHBOARD]: QuerySurface.APP,
        [QueryExecutionContext.EXPLORE]: QuerySurface.APP,
        [QueryExecutionContext.FILTER_AUTOCOMPLETE]: QuerySurface.APP,
        [QueryExecutionContext.CHART]: QuerySurface.APP,
        [QueryExecutionContext.CHART_HISTORY]: QuerySurface.APP,
        [QueryExecutionContext.SQL_CHART]: QuerySurface.APP,
        [QueryExecutionContext.SQL_RUNNER]: QuerySurface.APP,
        [QueryExecutionContext.VIEW_UNDERLYING_DATA]: QuerySurface.APP,
        [QueryExecutionContext.ALERT]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_DELIVERY]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.CSV]: QuerySurface.APP,
        [QueryExecutionContext.GSHEETS]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.GSHEETS_ADDON]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_GSHEETS_CHART]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_GSHEETS_DASHBOARD]:
            QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_GSHEETS_SQL_CHART]:
            QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_CHART]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.SCHEDULED_DASHBOARD]: QuerySurface.SCHEDULE,
        [QueryExecutionContext.CALCULATE_TOTAL]: QuerySurface.APP,
        [QueryExecutionContext.CALCULATE_SUBTOTAL]: QuerySurface.APP,
        [QueryExecutionContext.EMBED]: QuerySurface.EMBED,
        [QueryExecutionContext.AI]: QuerySurface.AI_AGENT,
        [QueryExecutionContext.MCP_RUN_METRIC_QUERY]: QuerySurface.MCP,
        [QueryExecutionContext.MCP_RUN_SQL]: QuerySurface.MCP,
        [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES]: QuerySurface.MCP,
        [QueryExecutionContext.API]: QuerySurface.API,
        [QueryExecutionContext.CLI]: QuerySurface.API,
        [QueryExecutionContext.METRICS_EXPLORER]: QuerySurface.APP,
        [QueryExecutionContext.PRE_AGGREGATE_MATERIALIZATION]:
            QuerySurface.SCHEDULE,
        [QueryExecutionContext.COMPOSE_SQL_RUNNER]: QuerySurface.APP,
        [QueryExecutionContext.MULTI_SOURCE_QUERY]: QuerySurface.APP,
        [QueryExecutionContext.DATA_APP_SAMPLE]: QuerySurface.APP,
    };

    it.each(Object.values(QueryExecutionContext))('maps %s', (context) => {
        expect(getQuerySurface(context, null)).toBe(expected[context]);
    });

    it('distinguishes Slack agent prompts', () => {
        expect(
            getQuerySurface(QueryExecutionContext.AI, QuerySurface.SLACK_AGENT),
        ).toBe(QuerySurface.SLACK_AGENT);
    });

    it('exports the credential and refusal vocabulary', () => {
        expect(QueryCredentialKind.PERSONAL).toBe('personal');
        expect(QueryRefusalReason.BLOCKED_FOR_AI).toBe('blocked_for_ai');
    });
});
