import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QueryEvent } from './useAppSdkBridge';
import { useTrackedAppQueries } from './useTrackedAppQueries';

const QUERY_UUID = 'q-shared-uuid';
const POST_ID_A = 'post-a';
const POST_ID_B = 'post-b';

function baseEvent(
    overrides: Partial<QueryEvent> & Pick<QueryEvent, 'id' | 'status'>,
): QueryEvent {
    return {
        timestamp: Date.now(),
        label: null,
        exploreName: '',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        tableCalculations: [],
        additionalMetrics: [],
        limit: 0,
        queryUuid: null,
        rowCount: null,
        durationMs: null,
        error: null,
        rawMetricQuery: null,
        ...overrides,
    };
}

describe('useTrackedAppQueries', () => {
    it('drains a results-cache-dedupe displaced id without corrupting the shared queryUuid entry', () => {
        // Same event sequence useAppSdkBridge emits when two POSTs (e.g. from
        // two components) resolve to the same queryUuid: POST A goes
        // pending -> running, POST B's own pending placeholder is added,
        // the bridge closes A's displaced lifecycle (queryUuid: null), POST
        // B's running event lands on the shared row, then the REAL GET-poll
        // terminal arrives keyed to POST B's id.
        const { result } = renderHook(() => useTrackedAppQueries());

        act(() => {
            result.current.handleQueryEvent(
                baseEvent({ id: POST_ID_A, status: 'pending' }),
            );
        });
        act(() => {
            result.current.handleQueryEvent(
                baseEvent({
                    id: POST_ID_A,
                    status: 'running',
                    queryUuid: QUERY_UUID,
                    exploreName: 'orders',
                }),
            );
        });
        act(() => {
            result.current.handleQueryEvent(
                baseEvent({ id: POST_ID_B, status: 'pending' }),
            );
        });
        act(() => {
            // Displaced-lifecycle close for A — queryUuid: null, as emitted
            // by useAppSdkBridge's fix.
            result.current.handleQueryEvent(
                baseEvent({ id: POST_ID_A, status: 'ready', queryUuid: null }),
            );
        });
        act(() => {
            result.current.handleQueryEvent(
                baseEvent({
                    id: POST_ID_B,
                    status: 'running',
                    queryUuid: QUERY_UUID,
                    exploreName: 'orders',
                }),
            );
        });
        act(() => {
            // The REAL poll outcome, re-keyed to POST B's id (the survivor
            // of the queryUuid -> id map overwrite) — a real error, so a
            // fabricated 'ready' would be an obvious, testable corruption.
            result.current.handleQueryEvent(
                baseEvent({
                    id: POST_ID_B,
                    status: 'error',
                    queryUuid: QUERY_UUID,
                    error: 'Warehouse timeout',
                }),
            );
        });

        expect(result.current.queries.some((q) => q.status === 'pending')).toBe(
            false,
        );

        const sharedEntry = result.current.queries.find(
            (q) => q.queryUuid === QUERY_UUID,
        );
        expect(sharedEntry).toMatchObject({
            status: 'error',
            error: 'Warehouse timeout',
        });

        // No blank ghost rows left over from the displaced-close signal.
        expect(result.current.queries).toHaveLength(1);
    });
});
