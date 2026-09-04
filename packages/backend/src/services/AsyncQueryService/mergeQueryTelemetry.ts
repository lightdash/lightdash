import {
    isMergeMetricSource,
    QueryHistoryStatus,
    type MergeQuery,
    type MergeQueryError,
    type QueryExecutionContext,
    type QueryHistory,
} from '@lightdash/common';
import type {
    MergeEngine,
    MergeQueryExecutedEvent,
    MergeQueryRefusedEvent,
    MergeQueryShapeProperties,
    MergeRefusalKind,
    MergeSourceKind,
} from '../../analytics/LightdashAnalytics';
import type { DuckdbQueryReferenceGuard } from './types';

/** What every merge event says about the merge that was submitted. */
export type MergeSubmission = {
    organizationUuid: string;
    projectUuid: string;
    context: QueryExecutionContext;
    mergeQuery: MergeQuery;
};

export const describeMergeQueryShape = ({
    organizationUuid,
    projectUuid,
    context,
    mergeQuery,
}: MergeSubmission): MergeQueryShapeProperties => ({
    organizationId: organizationUuid,
    projectId: projectUuid,
    context,
    joinType: mergeQuery.joinType,
    sourceKinds: mergeQuery.sources.map(
        (source): MergeSourceKind =>
            isMergeMetricSource(source) ? 'metric' : 'result',
    ),
    sourceCount: mergeQuery.sources.length,
    joinKeyCount: mergeQuery.joinKey.length,
    tableCalculationCount: mergeQuery.tableCalculations.length,
});

export const buildMergeRefusedEvent = ({
    submission,
    kinds,
    queryId,
}: {
    submission: MergeSubmission;
    kinds: [MergeRefusalKind, ...MergeRefusalKind[]];
    queryId: string | null;
}): MergeQueryRefusedEvent => ({
    event: 'merge_query.refused',
    properties: {
        ...describeMergeQueryShape(submission),
        kind: kinds[0],
        kinds: Array.from(new Set(kinds)),
        refusalCount: kinds.length,
        queryId,
    },
});

/** Null when the refusal carries no errors, so nothing empty is tracked. */
export const buildMergeRefusedEventFromErrors = ({
    submission,
    errors,
}: {
    submission: MergeSubmission;
    errors: MergeQueryError[];
}): MergeQueryRefusedEvent | null => {
    const [first, ...rest] = errors;
    if (first === undefined) return null;
    return buildMergeRefusedEvent({
        submission,
        kinds: [first.kind, ...rest.map((error) => error.kind)],
        queryId: null,
    });
};

export const buildMergeExecutedEvent = ({
    submission,
    queryId,
    engine,
    status,
    cacheHit,
    legCacheHits,
    rowCount,
    durationMs,
    joinExecutionTimeMs,
}: {
    submission: MergeSubmission;
    queryId: string;
    engine: MergeEngine;
    status: MergeQueryExecutedEvent['properties']['status'];
    cacheHit: boolean;
    /** One entry per leg this merge ran. */
    legCacheHits: boolean[];
    rowCount: number | null;
    durationMs: number | null;
    joinExecutionTimeMs: number | null;
}): MergeQueryExecutedEvent => ({
    event: 'merge_query.executed',
    properties: {
        ...describeMergeQueryShape(submission),
        queryId,
        engine,
        status,
        cacheHit,
        legCount: legCacheHits.length,
        legCacheHitCount: legCacheHits.filter(Boolean).length,
        rowCount,
        durationMs,
        joinExecutionTimeMs,
    },
});

/**
 * Wraps the row-cap guard so the reporter can tell a refusal from a join
 * failure: both end as the merged query's error, and only the guard knows
 * which it was.
 */
export const observeRowCapRefusal = (
    guard: DuckdbQueryReferenceGuard,
): { guard: DuckdbQueryReferenceGuard; wasRefused: () => boolean } => {
    let refused = false;
    return {
        guard: (completed) => {
            const refusal = guard(completed);
            if (refusal !== null) refused = true;
            return refusal;
        },
        wasRefused: () => refused,
    };
};

export type ComposeMergeOutcome =
    | { kind: 'refused_row_cap' }
    | {
          kind: 'ready';
          rowCount: number | null;
          joinExecutionTimeMs: number | null;
      }
    | { kind: 'error'; error: string | null };

/** Reads the merged query's terminal state once its background run settled. */
export const resolveComposeMergeOutcome = ({
    history,
    rowCapRefused,
}: {
    history: Pick<
        QueryHistory,
        'status' | 'totalRowCount' | 'warehouseExecutionTimeMs' | 'error'
    >;
    rowCapRefused: boolean;
}): ComposeMergeOutcome => {
    if (rowCapRefused) return { kind: 'refused_row_cap' };
    if (history.status === QueryHistoryStatus.READY) {
        return {
            kind: 'ready',
            rowCount: history.totalRowCount,
            joinExecutionTimeMs: history.warehouseExecutionTimeMs,
        };
    }
    return { kind: 'error', error: history.error };
};
