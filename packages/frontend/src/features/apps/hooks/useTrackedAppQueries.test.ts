import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { QueryEvent } from './useAppSdkBridge';
import {
    countReadyQueriesSinceBoundary,
    useTrackedAppQueries,
} from './useTrackedAppQueries';

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

    describe('resetKey', () => {
        it('does not clear on mount', () => {
            const { result } = renderHook(() => useTrackedAppQueries(1));

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'q1',
                        status: 'ready',
                        queryUuid: 'q1-uuid',
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(1);
        });

        it('clears queries when the reset key changes (e.g. app version navigation)', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'q1',
                        status: 'ready',
                        queryUuid: 'q1-uuid',
                    }),
                );
            });
            expect(result.current.queries).toHaveLength(1);

            rerender(2);

            expect(result.current.queries).toHaveLength(0);
        });

        it('does not clear queries when the reset key is unchanged across a rerender', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'q1',
                        status: 'ready',
                        queryUuid: 'q1-uuid',
                    }),
                );
            });

            rerender(1);

            expect(result.current.queries).toHaveLength(1);
        });

        // The parent-owned fetch/poll isn't torn down by an iframe reload, so
        // a query in flight at reset time can still deliver its terminal
        // event afterwards — it must be dropped, not appended as a phantom
        // row inflating the new boundary's count.
        it('drops a late terminal event (same id) for a query that was in-flight before the reset', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({ id: 'q1', status: 'pending' }),
                );
            });

            rerender(2);
            expect(result.current.queries).toHaveLength(0);

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'q1',
                        status: 'ready',
                        queryUuid: 'q1-uuid',
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(0);
        });

        // Results-cache dedupe can fold a second POST onto the same
        // queryUuid under a DIFFERENT id — id-only exclusion would miss this,
        // so the late event must also be blocked by queryUuid.
        it('drops a late terminal event (different id, same queryUuid) for a query in-flight before the reset', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({ id: 'post-a', status: 'pending' }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'post-a',
                        status: 'running',
                        queryUuid: 'shared-uuid',
                    }),
                );
            });

            rerender(2);
            expect(result.current.queries).toHaveLength(0);

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'post-b',
                        status: 'ready',
                        queryUuid: 'shared-uuid',
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(0);
        });

        // The backend can hand a NEW submission the SAME queryUuid as a wiped
        // one (results-cache dedupe). A permanent uuid blacklist would accept
        // the new request's pending event and drop its running/ready ones,
        // stranding it pending and zeroing capturedQueryCount for a valid app.
        it('reclaims an excluded queryUuid recycled by a live post-reset request', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

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
                    }),
                );
            });

            rerender(2);
            expect(result.current.queries).toHaveLength(0);

            // New version's identical query: fresh request id, recycled uuid.
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({ id: POST_ID_B, status: 'pending' }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'running',
                        queryUuid: QUERY_UUID,
                    }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'ready',
                        queryUuid: QUERY_UUID,
                        rowCount: 7,
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(1);
            expect(result.current.queries[0]).toMatchObject({
                id: POST_ID_B,
                status: 'ready',
                queryUuid: QUERY_UUID,
                rowCount: 7,
            });
            expect(
                countReadyQueriesSinceBoundary(result.current.queries, 0),
            ).toBe(1);
        });

        // Ordering matters: the pre-reset request's own late terminal must not
        // reclaim the uuid on its way out, or the new request that recycles it
        // afterwards inherits a phantom row instead of its own entry.
        it('drops the old late terminal first, then still lets the recycled uuid through', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

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
                    }),
                );
            });

            rerender(2);

            // Late terminal for the PRE-reset request, re-keyed to its POST id.
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_A,
                        status: 'ready',
                        queryUuid: QUERY_UUID,
                        rowCount: 99,
                    }),
                );
            });
            expect(result.current.queries).toHaveLength(0);

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({ id: POST_ID_B, status: 'pending' }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'running',
                        queryUuid: QUERY_UUID,
                    }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'ready',
                        queryUuid: QUERY_UUID,
                        rowCount: 7,
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(1);
            expect(result.current.queries[0]).toMatchObject({
                id: POST_ID_B,
                status: 'ready',
                rowCount: 7,
            });
        });

        // Linked charts emit no `pending` placeholder — their first event is
        // the POST-response `running`, so reclamation can't require a tracked
        // entry to already exist under the fresh id.
        it('reclaims a recycled uuid for a chart query whose first event is running', () => {
            const { result, rerender } = renderHook(
                (resetKey: number | undefined) =>
                    useTrackedAppQueries(resetKey),
                { initialProps: 1 },
            );

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_A,
                        status: 'running',
                        queryUuid: QUERY_UUID,
                    }),
                );
            });

            rerender(2);
            expect(result.current.queries).toHaveLength(0);

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'running',
                        queryUuid: QUERY_UUID,
                    }),
                );
            });
            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: POST_ID_B,
                        status: 'ready',
                        queryUuid: QUERY_UUID,
                        rowCount: 4,
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(1);
            expect(result.current.queries[0]).toMatchObject({
                id: POST_ID_B,
                status: 'ready',
                rowCount: 4,
            });
        });

        it('resetQueries() called directly also blocks a late event for a previously-tracked id', () => {
            const { result } = renderHook(() => useTrackedAppQueries());

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({ id: 'q1', status: 'pending' }),
                );
            });

            act(() => {
                result.current.resetQueries();
            });
            expect(result.current.queries).toHaveLength(0);

            act(() => {
                result.current.handleQueryEvent(
                    baseEvent({
                        id: 'q1',
                        status: 'ready',
                        queryUuid: 'q1-uuid',
                    }),
                );
            });

            expect(result.current.queries).toHaveLength(0);
        });
    });
});

describe('countReadyQueriesSinceBoundary', () => {
    const readyQuery = (id: string) =>
        baseEvent({ id, status: 'ready', queryUuid: `${id}-uuid` });
    const pendingQuery = (id: string) => baseEvent({ id, status: 'pending' });

    it('counts all ready queries when the boundary is zero', () => {
        expect(
            countReadyQueriesSinceBoundary(
                [readyQuery('a'), readyQuery('b'), pendingQuery('c')],
                0,
            ),
        ).toBe(2);
    });

    it('subtracts the boundary from the ready count', () => {
        expect(
            countReadyQueriesSinceBoundary(
                [readyQuery('a'), readyQuery('b'), readyQuery('c')],
                2,
            ),
        ).toBe(1);
    });

    it('never goes negative', () => {
        expect(countReadyQueriesSinceBoundary([readyQuery('a')], 5)).toBe(0);
    });
});
