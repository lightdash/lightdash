import { QueryExecutionContext } from '@lightdash/common';
import { getLiveRateLimitDeadlineMs } from './rateLimitDeadlines';

describe('getLiveRateLimitDeadlineMs', () => {
    it.each([
        [QueryExecutionContext.DASHBOARD, 60_000],
        [QueryExecutionContext.EXPLORE, 60_000],
        [QueryExecutionContext.CHART, 60_000],
        [QueryExecutionContext.FILTER_AUTOCOMPLETE, 60_000],
        [QueryExecutionContext.MULTI_SOURCE_QUERY, 60_000],
        [QueryExecutionContext.API, 60_000],
        [QueryExecutionContext.AI, 30_000],
        [QueryExecutionContext.MCP_QUERY, 30_000],
        [QueryExecutionContext.MCP_RUN_METRIC_QUERY, 30_000],
        [QueryExecutionContext.SCHEDULED_DELIVERY, 120_000],
        [QueryExecutionContext.SCHEDULED_DASHBOARD, 120_000],
    ])('gives %s %i ms', (context, deadlineMs) => {
        expect(getLiveRateLimitDeadlineMs(context)).toBe(deadlineMs);
    });
});
