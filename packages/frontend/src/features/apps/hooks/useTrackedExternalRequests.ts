import { useCallback, useRef, useState } from 'react';
import type { ExternalRequestEvent } from './useAppSdkBridge';

export type UseTrackedExternalRequestsResult = {
    externalRequests: ExternalRequestEvent[];
    handleExternalRequestEvent: (event: ExternalRequestEvent) => void;
    clearExternalRequests: () => void;
    interruptInFlightRequests: () => void;
};

/**
 * Tracks external-connection fetches emitted by the app preview iframe SDK
 * bridge. Simpler sibling of `useTrackedAppQueries`: an external fetch is a
 * single request → single response, so entries merge by `id` with no
 * queryUuid remap. Owns the "interrupted by reload" recovery used by the
 * builder when the preview iframe restarts while a fetch is still in flight.
 *
 * The persist-log preference is NOT owned here — it lives in
 * `useTrackedAppQueries` and is applied to both lists by the page.
 */
export const useTrackedExternalRequests =
    (): UseTrackedExternalRequestsResult => {
        const [externalRequests, setExternalRequests] = useState<
            ExternalRequestEvent[]
        >([]);
        // IDs of requests moved to a terminal `error` on iframe reload. The
        // parent-side fetch keeps running after the iframe dies and can emit a
        // late `ready`/`error` — this guard drops those so they neither
        // resurrect the entry nor append a ghost.
        const interruptedIdsRef = useRef<Set<string>>(new Set());

        const clearExternalRequests = useCallback(() => {
            setExternalRequests([]);
        }, []);

        const interruptInFlightRequests = useCallback(() => {
            setExternalRequests((prev) => {
                let mutated = false;
                const next = prev.map((r) => {
                    if (r.status !== 'pending') return r;
                    mutated = true;
                    interruptedIdsRef.current.add(r.id);
                    return {
                        ...r,
                        status: 'error' as const,
                        error: 'Interrupted by reload',
                    };
                });
                return mutated ? next : prev;
            });
        }, []);

        const handleExternalRequestEvent = useCallback(
            (event: ExternalRequestEvent) => {
                if (interruptedIdsRef.current.has(event.id)) return;
                setExternalRequests((prev) => {
                    const idx = prev.findIndex((r) => r.id === event.id);
                    if (idx < 0) return [...prev, event];
                    const existing = prev[idx];
                    // Don't resurrect a terminal entry (late duplicate event).
                    if (
                        existing.status === 'ready' ||
                        existing.status === 'error'
                    ) {
                        return prev;
                    }
                    return prev.map((r, i) =>
                        i === idx ? { ...r, ...event } : r,
                    );
                });
            },
            [],
        );

        return {
            externalRequests,
            handleExternalRequestEvent,
            clearExternalRequests,
            interruptInFlightRequests,
        };
    };
