import {
    MergeJoinType,
    MergeQueryErrorKind,
    QueryExecutionContext,
    QueryHistoryStatus,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    buildMergeExecutedEvent,
    buildMergeRefusedEvent,
    buildMergeRefusedEventFromErrors,
    describeMergeQueryShape,
    observeRowCapRefusal,
    resolveComposeMergeOutcome,
    type MergeSubmission,
} from './mergeQueryTelemetry';

const metricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const mergeQuery: MergeQuery = {
    sources: [
        { id: 'a', metricQuery },
        { id: 'b', queryUuid: 'result-query-uuid' },
    ],
    joinKey: [
        {
            name: 'month',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [{ name: 'ratio', displayName: 'Ratio', sql: '1' }],
    limit: 500,
};

const submission: MergeSubmission = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    context: QueryExecutionContext.EXPLORE,
    mergeQuery,
};

const shape = {
    organizationId: 'org-uuid',
    projectId: 'project-uuid',
    context: QueryExecutionContext.EXPLORE,
    joinType: MergeJoinType.LEFT,
    sourceKinds: ['metric', 'result'],
    sourceCount: 2,
    joinKeyCount: 1,
    tableCalculationCount: 1,
};

describe('describeMergeQueryShape', () => {
    it('names the join type and the kind of each source in order', () => {
        expect(describeMergeQueryShape(submission)).toEqual(shape);
    });
});

describe('buildMergeExecutedEvent', () => {
    it('counts leg cache hits from the legs that ran', () => {
        const event = buildMergeExecutedEvent({
            submission,
            queryId: 'merge-query-uuid',
            engine: 'compose',
            status: 'ready',
            cacheHit: false,
            legCacheHits: [true, false, true],
            rowCount: 42,
            durationMs: 1200,
            joinExecutionTimeMs: 80,
        });

        expect(event).toEqual({
            event: 'merge_query.executed',
            properties: {
                ...shape,
                queryId: 'merge-query-uuid',
                engine: 'compose',
                status: 'ready',
                cacheHit: false,
                legCount: 3,
                legCacheHitCount: 2,
                rowCount: 42,
                durationMs: 1200,
                joinExecutionTimeMs: 80,
            },
        });
    });

    it('reports a warehouse merge with no legs and no outcome', () => {
        const event = buildMergeExecutedEvent({
            submission,
            queryId: 'merge-query-uuid',
            engine: 'warehouse',
            status: 'started',
            cacheHit: true,
            legCacheHits: [],
            rowCount: null,
            durationMs: null,
            joinExecutionTimeMs: null,
        });

        expect(event.properties).toMatchObject({
            engine: 'warehouse',
            status: 'started',
            cacheHit: true,
            legCount: 0,
            legCacheHitCount: 0,
            rowCount: null,
            durationMs: null,
        });
    });
});

describe('buildMergeRefusedEvent', () => {
    it('leads with the first kind and lists each distinct kind once', () => {
        const event = buildMergeRefusedEvent({
            submission,
            kinds: [
                MergeQueryErrorKind.FAN_OUT,
                MergeQueryErrorKind.FAN_OUT,
                MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH,
            ],
            queryId: null,
        });

        expect(event).toEqual({
            event: 'merge_query.refused',
            properties: {
                ...shape,
                kind: MergeQueryErrorKind.FAN_OUT,
                kinds: [
                    MergeQueryErrorKind.FAN_OUT,
                    MergeQueryErrorKind.JOIN_KEY_TYPE_MISMATCH,
                ],
                refusalCount: 3,
                queryId: null,
            },
        });
    });

    it('carries the merged query id for a row cap refusal', () => {
        const event = buildMergeRefusedEvent({
            submission,
            kinds: ['row_cap'],
            queryId: 'merge-query-uuid',
        });

        expect(event.properties).toMatchObject({
            kind: 'row_cap',
            kinds: ['row_cap'],
            refusalCount: 1,
            queryId: 'merge-query-uuid',
        });
    });

    it('builds from compile errors and tracks nothing when there are none', () => {
        const event = buildMergeRefusedEventFromErrors({
            submission,
            errors: [
                {
                    kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
                    sourceId: 'a',
                    fieldIds: ['orders_month'],
                    message: 'not selected',
                },
            ],
        });

        expect(event?.properties).toMatchObject({
            kind: MergeQueryErrorKind.JOIN_KEY_NOT_SELECTED,
            queryId: null,
        });
        expect(
            buildMergeRefusedEventFromErrors({ submission, errors: [] }),
        ).toBeNull();
    });
});

describe('observeRowCapRefusal', () => {
    it('passes the guard result through and remembers a refusal', () => {
        const observed = observeRowCapRefusal(() => 'Query A hit the cap');

        expect(observed.wasRefused()).toBe(false);
        expect(observed.guard({})).toBe('Query A hit the cap');
        expect(observed.wasRefused()).toBe(true);
    });

    it('stays clear when the guard lets the join proceed', () => {
        const observed = observeRowCapRefusal(() => null);

        expect(observed.guard({})).toBeNull();
        expect(observed.wasRefused()).toBe(false);
    });
});

describe('resolveComposeMergeOutcome', () => {
    const ready = {
        status: QueryHistoryStatus.READY,
        totalRowCount: 10,
        warehouseExecutionTimeMs: 55,
        error: null,
    };

    it('is a refusal when the row cap guard fired, whatever the row says', () => {
        expect(
            resolveComposeMergeOutcome({
                history: { ...ready, status: QueryHistoryStatus.ERROR },
                rowCapRefused: true,
            }),
        ).toEqual({ kind: 'refused_row_cap' });
    });

    it('is an execution with the join row count and time when ready', () => {
        expect(
            resolveComposeMergeOutcome({
                history: ready,
                rowCapRefused: false,
            }),
        ).toEqual({ kind: 'ready', rowCount: 10, joinExecutionTimeMs: 55 });
    });

    it('is a failure carrying the stored error otherwise', () => {
        expect(
            resolveComposeMergeOutcome({
                history: {
                    status: QueryHistoryStatus.ERROR,
                    totalRowCount: null,
                    warehouseExecutionTimeMs: null,
                    error: 'Conversion error',
                },
                rowCapRefused: false,
            }),
        ).toEqual({ kind: 'error', error: 'Conversion error' });
    });
});
