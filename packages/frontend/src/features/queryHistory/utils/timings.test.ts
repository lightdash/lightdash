import {
    QueryExecutionContext,
    QueryHistoryStatus,
    QueryLanguage,
    QueryTrigger,
    type QueryHistoryListItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getQueryTimings } from './timings';

const buildItem = (
    overrides: Partial<QueryHistoryListItem>,
): QueryHistoryListItem =>
    ({
        queryUuid: 'queryUuid',
        createdAt: new Date('2026-09-02T12:00:00.000Z'),
        projectUuid: 'projectUuid',
        context: QueryExecutionContext.EXPLORE,
        trigger: QueryTrigger.INTERACTIVE,
        language: QueryLanguage.SEMANTIC,
        status: QueryHistoryStatus.READY,
        title: 'title',
        subline: 'subline',
        error: null,
        exploreName: 'explore',
        metricQuery: null,
        requestParameters: {},
        chartName: null,
        chartUuid: null,
        savedSqlUuid: null,
        dashboardName: null,
        dashboardUuid: null,
        compiledSql: 'select 1',
        totalRowCount: 1,
        warehouseExecutionTimeMs: 0,
        cacheHit: false,
        resultsExpiresAt: null,
        processingStartedAt: null,
        resultsUpdatedAt: null,
        erroredAt: null,
        ...overrides,
    }) as QueryHistoryListItem;

describe('getQueryTimings', () => {
    it('splits a fresh run into queued, warehouse and fetch', () => {
        const timings = getQueryTimings(
            buildItem({
                processingStartedAt: new Date('2026-09-02T12:00:00.100Z'),
                warehouseExecutionTimeMs: 400,
                resultsUpdatedAt: new Date('2026-09-02T12:00:01.000Z'),
            }),
        );

        expect(timings).toEqual({
            totalMs: 1000,
            queuedMs: 100,
            warehouseMs: 400,
            fetchMs: 500,
        });
    });

    it('reports no total for a cache hit, whose results predate the run', () => {
        const timings = getQueryTimings(
            buildItem({
                cacheHit: true,
                processingStartedAt: new Date('2026-09-02T12:00:00.010Z'),
                warehouseExecutionTimeMs: 0,
                // The cached file was written by an earlier run, an hour ago.
                resultsUpdatedAt: new Date('2026-09-02T11:00:00.000Z'),
            }),
        );

        expect(timings.totalMs).toBeNull();
        expect(timings.fetchMs).toBeNull();
        expect(timings.queuedMs).toBe(10);
        expect(timings.warehouseMs).toBe(0);
    });

    it('ends a failed run at its error time', () => {
        const timings = getQueryTimings(
            buildItem({
                status: QueryHistoryStatus.ERROR,
                error: 'boom',
                erroredAt: new Date('2026-09-02T12:00:02.000Z'),
                resultsUpdatedAt: null,
            }),
        );

        expect(timings.totalMs).toBe(2000);
    });

    it('reports no total while a run is still going', () => {
        const timings = getQueryTimings(
            buildItem({ status: QueryHistoryStatus.EXECUTING }),
        );

        expect(timings.totalMs).toBeNull();
        expect(timings.fetchMs).toBeNull();
    });
});
