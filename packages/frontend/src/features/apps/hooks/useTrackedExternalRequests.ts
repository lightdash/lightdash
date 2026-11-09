import { useCallback, useRef, useState } from 'react';
import type { AppStateEvent, ExternalRequestEvent } from './useAppSdkBridge';

/** The lifecycle shape both trackers key on: entries merge by `id` and move
 *  to a terminal `error` when the iframe reloads mid-flight. */
type TrackedRequest = {
    id: string;
    status: 'pending' | 'ready' | 'error';
    error: string | null;
};

type UseTrackedRequestsResult<T extends TrackedRequest> = {
    requests: T[];
    handleEvent: (event: T) => void;
    clear: () => void;
    interruptInFlight: () => void;
};

/**
 * Tracks single-shot request events emitted by the app preview iframe SDK
 * bridge. Simpler sibling of `useTrackedAppQueries`: one request → one
 * response, so entries merge by `id` with no queryUuid remap. Owns the
 * "interrupted by reload" recovery used by the builder when the preview
 * iframe restarts while a request is still in flight.
 *
 * The persist-log preference is NOT owned here — it lives in
 * `useTrackedAppQueries` and is applied to all lists by the page.
 */
const useTrackedRequests = <
    T extends TrackedRequest,
>(): UseTrackedRequestsResult<T> => {
    const [requests, setRequests] = useState<T[]>([]);
    // IDs of requests moved to a terminal `error` on iframe reload. The
    // parent-side fetch keeps running after the iframe dies and can emit a
    // late `ready`/`error` — this guard drops those so they neither
    // resurrect the entry nor append a ghost.
    const interruptedIdsRef = useRef<Set<string>>(new Set());

    const clear = useCallback(() => {
        setRequests((prev) => {
            // A cleared pending request's fetch keeps running; drop its late
            // terminal event instead of letting it repopulate the empty log.
            for (const r of prev) {
                if (r.status === 'pending') interruptedIdsRef.current.add(r.id);
            }
            return [];
        });
    }, []);

    const interruptInFlight = useCallback(() => {
        setRequests((prev) => {
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

    const handleEvent = useCallback((event: T) => {
        if (interruptedIdsRef.current.has(event.id)) return;
        setRequests((prev) => {
            const idx = prev.findIndex((r) => r.id === event.id);
            if (idx < 0) return [...prev, event];
            const existing = prev[idx];
            // Don't resurrect a terminal entry (late duplicate event).
            if (existing.status === 'ready' || existing.status === 'error') {
                return prev;
            }
            return prev.map((r, i) => (i === idx ? { ...r, ...event } : r));
        });
    }, []);

    return { requests, handleEvent, clear, interruptInFlight };
};

export type UseTrackedExternalRequestsResult = {
    externalRequests: ExternalRequestEvent[];
    handleExternalRequestEvent: (event: ExternalRequestEvent) => void;
    clearExternalRequests: () => void;
    interruptInFlightRequests: () => void;
};

/** Tracks external-connection fetches for the inspector's Requests tab. */
export const useTrackedExternalRequests =
    (): UseTrackedExternalRequestsResult => {
        const { requests, handleEvent, clear, interruptInFlight } =
            useTrackedRequests<ExternalRequestEvent>();
        return {
            externalRequests: requests,
            handleExternalRequestEvent: handleEvent,
            clearExternalRequests: clear,
            interruptInFlightRequests: interruptInFlight,
        };
    };

export type UseTrackedAppStateEventsResult = {
    appStateEvents: AppStateEvent[];
    handleAppStateEvent: (event: AppStateEvent) => void;
    clearAppStateEvents: () => void;
    interruptInFlightAppStateEvents: () => void;
};

/** Tracks app-state reads/writes for the inspector's Requests tab. */
export const useTrackedAppStateEvents = (): UseTrackedAppStateEventsResult => {
    const { requests, handleEvent, clear, interruptInFlight } =
        useTrackedRequests<AppStateEvent>();
    return {
        appStateEvents: requests,
        handleAppStateEvent: handleEvent,
        clearAppStateEvents: clear,
        interruptInFlightAppStateEvents: interruptInFlight,
    };
};
