import { describe, expect, it } from 'vitest';
import { isAiAccessQueryContext, QueryExecutionContext } from './analytics';

describe('isAiAccessQueryContext', () => {
    it.each([
        QueryExecutionContext.AI,
        QueryExecutionContext.MCP_RUN_METRIC_QUERY,
        QueryExecutionContext.MCP_RUN_SQL,
        QueryExecutionContext.MCP_SEARCH_FIELD_VALUES,
        QueryExecutionContext.DATA_APP_SAMPLE,
        QueryExecutionContext.DATA_APP,
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
