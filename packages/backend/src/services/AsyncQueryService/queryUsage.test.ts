import {
    QueryExecutionContext,
    type QueryUsageMetadata,
} from '@lightdash/common';
import { queryUsageProperties, queryWorkloadOrigin } from './queryUsage';

const usage: QueryUsageMetadata = {
    startedAtMs: 1000,
    timingBasis: 'request',
    requestId: 'request',
    parentOperationId: null,
    actorType: 'registered_user',
    appId: null,
    dashboardTileId: 'tile-a',
    schedulerId: null,
};

describe('Query activity attribution', () => {
    afterEach(() => vi.useRealTimers());
    it.each([
        [QueryExecutionContext.DASHBOARD, 'interactive'],
        [QueryExecutionContext.AUTOREFRESHED_DASHBOARD, 'autorefresh'],
        [QueryExecutionContext.SCHEDULED_DELIVERY, 'scheduled'],
        [QueryExecutionContext.SCHEDULED_GSHEETS_CHART, 'scheduled'],
        [QueryExecutionContext.AI, 'agent'],
        [QueryExecutionContext.MCP_RUN_SQL, 'mcp'],
        [QueryExecutionContext.API, 'unknown'],
        [QueryExecutionContext.CLI, 'unknown'],
        [QueryExecutionContext.CALCULATE_TOTAL, 'unknown'],
    ])('keeps the explicit %s workload origin', (context, expected) => {
        expect(queryWorkloadOrigin(context, usage)).toBe(expected);
    });
    it('uses app and scheduler attribution for child queries without losing the detailed context', () => {
        expect(
            queryWorkloadOrigin(QueryExecutionContext.EXPLORE, {
                ...usage,
                appId: 'app',
            }),
        ).toBe('app');
        expect(
            queryWorkloadOrigin(QueryExecutionContext.EXPLORE, {
                ...usage,
                schedulerId: 'schedule',
            }),
        ).toBe('scheduled');
        expect(
            queryWorkloadOrigin(QueryExecutionContext.AI, {
                ...usage,
                appId: 'app',
            }),
        ).toBe('agent');
    });
    it('records elapsed time and distinct tile IDs without inventing historical timestamps', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1250);
        const tags = { query_context: QueryExecutionContext.DASHBOARD };
        expect(queryUsageProperties(tags, usage)).toMatchObject({
            responseTimeMs: 250,
            dashboardTileId: 'tile-a',
        });
        expect(
            queryUsageProperties(tags, { ...usage, dashboardTileId: 'tile-b' }),
        ).toMatchObject({ responseTimeMs: 250, dashboardTileId: 'tile-b' });
        expect(queryUsageProperties(tags)).toMatchObject({
            responseTimeMs: null,
            initiatingActorType: null,
            dashboardTileId: null,
        });
        expect(
            queryUsageProperties(tags, { ...usage, startedAtMs: 2000 })
                .responseTimeMs,
        ).toBeNull();
    });
});
