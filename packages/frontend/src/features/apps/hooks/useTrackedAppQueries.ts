import { useLocalStorage } from '@mantine-8/hooks';
import { useCallback, useRef, useState } from 'react';
import type { QueryEvent } from './useAppSdkBridge';

const PERSIST_LOGS_STORAGE_KEY = 'data-apps:persist-logs';

export type UseTrackedAppQueriesResult = {
    queries: QueryEvent[];
    persistLogs: boolean;
    setPersistLogs: (value: boolean) => void;
    handleQueryEvent: (event: QueryEvent) => void;
    clearQueries: () => void;
    interruptInFlightQueries: () => void;
};

/**
 * Tracks metric queries emitted by the app preview iframe SDK bridge.
 *
 * Owns the merge logic that turns POST initiations + poll results into a
 * single timeline entry per query, plus the "interrupted by reload" recovery
 * used by the builder when the preview iframe restarts mid-query.
 *
 * Shared between the builder (`AppGenerate`) where the queries panel is
 * always-on, and the preview (`AppPreviewTest`) where it's opt-in via a menu.
 * Preview uses only `queries`, `handleQueryEvent`, and `clearQueries` — the
 * persist/interrupt machinery is builder-specific (preview iframe never
 * reloads mid-session) but is harmless to expose.
 */
export const useTrackedAppQueries = (): UseTrackedAppQueriesResult => {
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

    const clearQueries = useCallback(() => {
        setQueries([]);
    }, []);

    // Move pending/running entries into a terminal `error` state. Used when
    // the preview iframe reloads with persistLogs on — the iframe that would
    // have polled their queryUuids is dead, so they would otherwise sit
    // non-terminal forever.
    const interruptInFlightQueries = useCallback(() => {
        setQueries((prev) => {
            let mutated = false;
            const next = prev.map((q) => {
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
            return mutated ? next : prev;
        });
    }, []);

    const handleQueryEvent = useCallback((event: QueryEvent) => {
        // Drop late events (typically the POST-resolution `running` event)
        // for requests we already marked interrupted — without this they
        // either un-terminal the entry or get appended as a ghost.
        if (interruptedRequestIdsRef.current.has(event.id)) {
            return;
        }
        setQueries((prev) => {
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
                        return prev;
                    }
                    return prev.map((q) =>
                        q.queryUuid === event.queryUuid
                            ? {
                                  ...q,
                                  label: event.label ?? q.label,
                                  status: event.status,
                                  rowCount: event.rowCount ?? q.rowCount,
                                  durationMs: event.durationMs ?? q.durationMs,
                                  error: event.error ?? q.error,
                                  rawMetricQuery:
                                      event.rawMetricQuery ?? q.rawMetricQuery,
                              }
                            : q,
                    );
                }
            }
            // If this is a POST initiation with queryUuid, check if we
            // have a pending entry from the same request id to merge
            const pendingIdx = prev.findIndex(
                (q) => q.id === event.id && q.status === 'pending',
            );
            if (pendingIdx >= 0) {
                return prev.map((q, i) =>
                    i === pendingIdx
                        ? {
                              ...event,
                              rawMetricQuery:
                                  event.rawMetricQuery ?? q.rawMetricQuery,
                          }
                        : q,
                );
            }
            return [...prev, event];
        });
    }, []);

    return {
        queries,
        persistLogs,
        setPersistLogs,
        handleQueryEvent,
        clearQueries,
        interruptInFlightQueries,
    };
};
