import { describe, expect, it } from 'vitest';
import {
    isAiAccessQueryContext,
    QueryExecutionContext,
    QuerySurface,
    querySurfaceFromContext,
} from './analytics';

describe('isAiAccessQueryContext', () => {
    it.each([
        QueryExecutionContext.AI,
        QueryExecutionContext.DATA_APP_SAMPLE,
        QueryExecutionContext.MCP_RUN_METRIC_QUERY,
        QueryExecutionContext.MCP_RUN_SQL,
        QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
    ])('recognizes %s as AI access', (context) => {
        expect(isAiAccessQueryContext(context)).toBe(true);
    });

    it.each([
        QueryExecutionContext.EXPLORE,
        QueryExecutionContext.FILTER_AUTOCOMPLETE,
        QueryExecutionContext.API,
    ])('leaves %s outside AI access', (context) => {
        expect(isAiAccessQueryContext(context)).toBe(false);
    });
});

describe('querySurfaceFromContext', () => {
    it.each([
        [QueryExecutionContext.AI, QuerySurface.APP],
        [QueryExecutionContext.DATA_APP_SAMPLE, QuerySurface.APP],
        [QueryExecutionContext.MCP_RUN_METRIC_QUERY, QuerySurface.MCP],
        [QueryExecutionContext.MCP_RUN_SQL, QuerySurface.MCP],
        [QueryExecutionContext.MCP_SEARCH_FIELD_VALUES, QuerySurface.MCP],
    ] as const)('maps %s to %s', (context, surface) => {
        expect(querySurfaceFromContext(context)).toBe(surface);
    });
});
