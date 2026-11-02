import { type AppSdkLineageSelection } from '@lightdash/common';
import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PipelineEvent, QueryEvent } from './useAppSdkBridge';

const PERSIST_LOGS_STORAGE_KEY = 'data-apps:persist-logs';

export type UseTrackedAppQueriesResult = {
    queries: QueryEvent[];
    /** Composer pipelines, sharing the queries' clear/reset/interrupt lifecycle. */
    pipelines: PipelineEvent[];
    persistLogs: boolean;
    setPersistLogs: (value: boolean) => void;
    handleQueryEvent: (event: QueryEvent) => void;
    handlePipelineEvent: (event: PipelineEvent) => void;
    clearQueries: () => void;
    resetQueries: () => void;
    interruptInFlightQueries: () => void;
};

/**
 * Count of `ready` entries beyond a previously-recorded boundary. Used to
 * scope a live query count (e.g. the scheduler's app csv/xlsx gate) to "since
 * the last version switch" while the full list — kept around for "Persist" —
 * still carries earlier versions' entries.
 */
const isInFlight = (event: { status: QueryEvent['status'] }) =>
    event.status === 'pending' || event.status === 'running';

/** The queryUuid an inspect-data click points at; author-id-only stamps
 *  resolve to that id's latest run. */
export const resolveSelectedQueryUuid = (
    queries: QueryEvent[],
    selection: AppSdkLineageSelection,
): string | null =>
    selection.queryUuid ??
    [...queries]
        .reverse()
        .find((q) => q.queryId === selection.queryId && q.queryUuid !== null)
        ?.queryUuid ??
    null;

export const countReadyQueriesSinceBoundary = (
    queries: QueryEvent[],
    boundary: number,
): number =>
    Math.max(0, queries.filter((q) => q.status === 'ready').length - boundary);

/**
 * Tracks metric queries emitted by the app preview iframe SDK bridge.
 *
 * Owns the merge logic that turns POST initiations + poll results into a
 * single timeline entry per query, plus the "interrupted by reload" recovery
 * used by the builder when the preview iframe restarts mid-query.
 *
 * Used directly by the builder (`AppGenerate`) and through `useAppInspector`
 * by the viewer page and the AI thread preview.
 *
 * @param resetKey - When this changes (e.g. the previewed app version),
 * queries are reset automatically (see resetQueries). Omit to manage resets
 * manually.
 */
export const useTrackedAppQueries = (
    resetKey?: string | number,
): UseTrackedAppQueriesResult => {
    const [queries, setQueries] = useState<QueryEvent[]>([]);
    // Mirrors Chrome DevTools "Preserve log". When off (default), the queries
    // panel is cleared on iframe refresh and on new-version load — fresh
    // bundles re-run their queries, so stale entries would only confuse the
    // user. Stored in localStorage so the preference survives a tab close
    // and stays consistent across tabs.
    const [persistLogs, setPersistLogs] = useLocalStorage<boolean>({
        key: PERSIST_LOGS_STORAGE_KEY,
        defaultValue: false,
    });
    // Request IDs of queries we marked as interrupted on iframe reload. The
    // bridge's parent-side fetch keeps running after the iframe dies and will
    // emit a late `running` event for them — without this guard that event
    // would resurrect the entry as 'running', or (if not matched) get appended
    // as a fresh ghost entry. The set grows for the page session; entries are
    // short request IDs, so the footprint is negligible.
    const interruptedRequestIdsRef = useRef<Set<string>>(new Set());
    // queryUuids of entries wiped by resetQueries(). A late event can arrive
    // under a DIFFERENT id than the one we interrupted (results-cache dedupe
    // folds a second POST onto the same queryUuid) — id-only exclusion misses
    // that case, so terminal events are also checked against this set. Not
    // permanent: handleQueryEvent hands a uuid back to a live request that
    // the backend gave the same uuid to, so a valid new version isn't muted.
    const interruptedQueryUuidsRef = useRef<Set<string>>(new Set());
    // Mirror of `queries`, kept in sync by commitQueries. Reading state from a
    // ref instead of a functional updater keeps the exclusion bookkeeping (ref
    // mutations) out of the updater, which React may invoke more than once.
    const queriesRef = useRef<QueryEvent[]>([]);
    const [pipelines, setPipelines] = useState<PipelineEvent[]>([]);
    const pipelinesRef = useRef<PipelineEvent[]>([]);

    const commitQueries = useCallback((next: QueryEvent[]) => {
        queriesRef.current = next;
        setQueries(next);
    }, []);
    const commitPipelines = useCallback((next: PipelineEvent[]) => {
        pipelinesRef.current = next;
        setPipelines(next);
    }, []);

    const clearQueries = useCallback(() => {
        commitQueries([]);
        commitPipelines([]);
    }, [commitQueries, commitPipelines]);

    // Like clearQueries(), but for a resource-boundary reset (version switch)
    // rather than an explicit "clear the log" action: the parent-owned
    // fetch/poll isn't torn down by an iframe reload, so a query in flight at
    // reset time can still deliver its terminal event afterwards. Without
    // remembering the wiped entries' ids/queryUuids, that late event finds
    // nothing to merge into and gets appended as a phantom row inflating the
    // new boundary's count — mirroring why interruptInFlightQueries registers
    // ids instead of just dropping entries.
    const resetQueries = useCallback(() => {
        queriesRef.current.forEach((q) => {
            interruptedRequestIdsRef.current.add(q.id);
            if (q.queryUuid) {
                interruptedQueryUuidsRef.current.add(q.queryUuid);
            }
        });
        // Pipelines are keyed by their POST id only, so id exclusion suffices.
        pipelinesRef.current.forEach((p) =>
            interruptedRequestIdsRef.current.add(p.id),
        );
        commitQueries([]);
        commitPipelines([]);
    }, [commitQueries, commitPipelines]);

    // Resets on every resetKey change but not on mount, so a caller passing
    // e.g. the previewed version never loses queries fired during initial load.
    const previousResetKeyRef = useRef(resetKey);
    useEffect(() => {
        if (previousResetKeyRef.current === resetKey) return;
        previousResetKeyRef.current = resetKey;
        resetQueries();
    }, [resetKey, resetQueries]);

    // Move pending/running entries into a terminal `error` state. Used when
    // the preview iframe reloads with persistLogs on — the iframe that would
    // have polled their queryUuids is dead, so they would otherwise sit
    // non-terminal forever.
    const interruptInFlightQueries = useCallback(() => {
        let mutated = false;
        const next = queriesRef.current.map((q) => {
            if (q.status !== 'pending' && q.status !== 'running') {
                return q;
            }
            mutated = true;
            interruptedRequestIdsRef.current.add(q.id);
            return {
                ...q,
                status: 'error' as const,
                error: 'Interrupted by reload',
            };
        });
        if (mutated) commitQueries(next);
        if (pipelinesRef.current.some(isInFlight)) {
            commitPipelines(
                pipelinesRef.current.map((p) => {
                    if (!isInFlight(p)) return p;
                    interruptedRequestIdsRef.current.add(p.id);
                    return {
                        ...p,
                        status: 'error' as const,
                        error: 'Interrupted by reload',
                    };
                }),
            );
        }
    }, [commitQueries, commitPipelines]);

    // Bridge events are full snapshots: upsert by id, never un-terminal.
    const handlePipelineEvent = useCallback(
        (event: PipelineEvent) => {
            if (interruptedRequestIdsRef.current.has(event.id)) return;
            const prev = pipelinesRef.current;
            const existing = prev.find((p) => p.id === event.id);
            if (!existing) {
                commitPipelines([...prev, event]);
                return;
            }
            if (!isInFlight(existing)) return;
            commitPipelines(prev.map((p) => (p.id === event.id ? event : p)));
        },
        [commitPipelines],
    );

    const handleQueryEvent = useCallback(
        (event: QueryEvent) => {
            // Drop late events (typically the POST-resolution `running` event)
            // for requests we already marked interrupted — without this they
            // either un-terminal the entry or get appended as a ghost.
            if (interruptedRequestIdsRef.current.has(event.id)) {
                return;
            }
            const prev = queriesRef.current;
            // Same drop, keyed by queryUuid — but reclaimable, because the
            // backend can hand a NEW submission a recycled uuid: a tracked id
            // or a non-terminal event means a live request owns it now.
            if (
                event.queryUuid &&
                interruptedQueryUuidsRef.current.has(event.queryUuid)
            ) {
                const isLiveRequest =
                    event.status === 'pending' ||
                    event.status === 'running' ||
                    prev.some((q) => q.id === event.id);
                if (!isLiveRequest) return;
                interruptedQueryUuidsRef.current.delete(event.queryUuid);
            }
            // If this event has a queryUuid, merge it with an existing entry
            if (event.queryUuid) {
                const existing = prev.find(
                    (q) => q.queryUuid === event.queryUuid,
                );
                if (existing) {
                    // Don't resurrect a terminal entry. Covers the rare race
                    // where iframe-1 managed to issue a poll GET before
                    // dying, so a late `ready` event arrives keyed on the
                    // (already-interrupted) queryUuid.
                    if (
                        existing.status === 'ready' ||
                        existing.status === 'error'
                    ) {
                        return;
                    }
                    commitQueries(
                        prev
                            .map((q) =>
                                q.queryUuid === event.queryUuid
                                    ? {
                                          ...q,
                                          label: event.label ?? q.label,
                                          queryId: event.queryId ?? q.queryId,
                                          description:
                                              event.description ??
                                              q.description,
                                          chartUuid:
                                              event.chartUuid ?? q.chartUuid,
                                          status: event.status,
                                          rowCount:
                                              event.rowCount ?? q.rowCount,
                                          durationMs:
                                              event.durationMs ?? q.durationMs,
                                          error: event.error ?? q.error,
                                          rawMetricQuery:
                                              event.rawMetricQuery ??
                                              q.rawMetricQuery,
                                      }
                                    : q,
                            )
                            .filter(
                                // Drop this event's own now-redundant `pending`
                                // placeholder — results-cache dedupe means a
                                // second POST can fold into an entry it didn't
                                // create, stranding its own placeholder row.
                                (q) =>
                                    !(
                                        q.id === event.id &&
                                        q.status === 'pending' &&
                                        q.queryUuid !== event.queryUuid
                                    ),
                            ),
                    );
                    return;
                }
            }
            // If this is a POST initiation with queryUuid, check if we
            // have a pending entry from the same request id to merge
            const pendingIdx = prev.findIndex(
                (q) => q.id === event.id && q.status === 'pending',
            );
            if (pendingIdx >= 0) {
                commitQueries(
                    prev.map((q, i) =>
                        i === pendingIdx
                            ? {
                                  ...event,
                                  queryId: event.queryId ?? q.queryId,
                                  description:
                                      event.description ?? q.description,
                                  rawMetricQuery:
                                      event.rawMetricQuery ?? q.rawMetricQuery,
                              }
                            : q,
                    ),
                );
                return;
            }
            const isTerminal =
                event.status === 'ready' || event.status === 'error';
            // A queryUuid-less terminal for an id we already track (e.g. a
            // displaced-lifecycle close signal) carries no new info — drop
            // it rather than append a blank ghost row.
            if (
                !event.queryUuid &&
                isTerminal &&
                prev.some((q) => q.id === event.id)
            ) {
                return;
            }
            commitQueries([...prev, event]);
        },
        [commitQueries],
    );

    return {
        queries,
        pipelines,
        persistLogs,
        setPersistLogs,
        handleQueryEvent,
        handlePipelineEvent,
        clearQueries,
        resetQueries,
        interruptInFlightQueries,
    };
};
