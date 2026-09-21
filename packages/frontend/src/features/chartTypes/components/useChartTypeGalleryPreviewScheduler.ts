import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefCallback,
} from 'react';

const DEFAULT_MAX_CONCURRENT = 4;
const DEFAULT_TIMEOUT_MS = 15_000;

type PreviewStatus = 'idle' | 'unavailable';

type Options = {
    maxConcurrent?: number;
    timeoutMs?: number;
};

type Scheduler = {
    register: (id: string) => (element: HTMLDivElement | null) => void;
    isMounted: (id: string) => boolean;
    status: (id: string) => PreviewStatus;
    complete: (id: string) => void;
    fail: (id: string) => void;
    retry: (id: string) => void;
};

/**
 * Mounts only nearby gallery previews and bounds the work they can start.
 * A loaded iframe stays mounted while visible but releases its scheduler slot.
 */
export const useChartTypeGalleryPreviewScheduler = ({
    maxConcurrent = DEFAULT_MAX_CONCURRENT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
}: Options = {}): Scheduler => {
    const observerRef = useRef<IntersectionObserver | null>(null);
    const visibleIds = useRef(new Set<string>());
    const elements = useRef(new Map<string, HTMLDivElement>());
    const registerCallbacks = useRef(
        new Map<string, RefCallback<HTMLDivElement>>(),
    );
    const mountedIds = useRef(new Set<string>());
    const pendingIds = useRef(new Set<string>());
    const unavailableIds = useRef(new Set<string>());
    const timeouts = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const [, setRevision] = useState(0);

    const rerender = useCallback(() => setRevision((value) => value + 1), []);

    const clearTimeoutFor = useCallback((id: string) => {
        const timeout = timeouts.current.get(id);
        if (timeout) clearTimeout(timeout);
        timeouts.current.delete(id);
    }, []);

    const schedule = useCallback(() => {
        let changed = false;
        for (const id of visibleIds.current) {
            if (
                pendingIds.current.size >= maxConcurrent ||
                mountedIds.current.has(id) ||
                unavailableIds.current.has(id)
            ) {
                continue;
            }
            mountedIds.current.add(id);
            pendingIds.current.add(id);
            timeouts.current.set(
                id,
                setTimeout(() => {
                    if (!pendingIds.current.delete(id)) return;
                    mountedIds.current.delete(id);
                    unavailableIds.current.add(id);
                    timeouts.current.delete(id);
                    rerender();
                    schedule();
                }, timeoutMs),
            );
            changed = true;
        }
        if (changed) rerender();
    }, [maxConcurrent, rerender, timeoutMs]);

    const stop = useCallback(
        (id: string) => {
            clearTimeoutFor(id);
            const wasVisible = visibleIds.current.delete(id);
            const wasPending = pendingIds.current.delete(id);
            const wasMounted = mountedIds.current.delete(id);
            const changed = wasVisible || wasPending || wasMounted;
            if (changed) {
                rerender();
                schedule();
            }
        },
        [clearTimeoutFor, rerender, schedule],
    );

    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return;
        observerRef.current = new IntersectionObserver(
            (entries) => {
                let changed = false;
                for (const entry of entries) {
                    const id = [...elements.current.entries()].find(
                        ([, element]) => element === entry.target,
                    )?.[0];
                    if (!id) continue;
                    if (entry.isIntersecting) {
                        changed = !visibleIds.current.has(id) || changed;
                        visibleIds.current.add(id);
                    } else {
                        clearTimeoutFor(id);
                        const wasVisible = visibleIds.current.delete(id);
                        const wasPending = pendingIds.current.delete(id);
                        const wasMounted = mountedIds.current.delete(id);
                        changed =
                            wasVisible || wasPending || wasMounted || changed;
                    }
                }
                if (changed) rerender();
                schedule();
            },
            { rootMargin: '200px 0px' },
        );
        const observer = observerRef.current;
        const activeTimeouts = timeouts.current;
        const activePendingIds = pendingIds.current;
        const activeMountedIds = mountedIds.current;
        const activeVisibleIds = visibleIds.current;
        for (const element of elements.current.values())
            observer.observe(element);
        return () => {
            observer.disconnect();
            for (const timeout of activeTimeouts.values())
                clearTimeout(timeout);
            activeTimeouts.clear();
            activePendingIds.clear();
            activeMountedIds.clear();
            activeVisibleIds.clear();
        };
    }, [clearTimeoutFor, rerender, schedule]);

    const register = useCallback(
        (id: string) => {
            const existing = registerCallbacks.current.get(id);
            if (existing) return existing;
            const callback: RefCallback<HTMLDivElement> = (element) => {
                const previous = elements.current.get(id);
                if (previous && previous !== element) {
                    observerRef.current?.unobserve(previous);
                }
                if (element) {
                    registerCallbacks.current.set(id, callback);
                    elements.current.set(id, element);
                    observerRef.current?.observe(element);
                } else if (registerCallbacks.current.get(id) === callback) {
                    elements.current.delete(id);
                    registerCallbacks.current.delete(id);
                    stop(id);
                }
            };
            registerCallbacks.current.set(id, callback);
            return callback;
        },
        [stop],
    );

    const complete = useCallback(
        (id: string) => {
            if (!pendingIds.current.delete(id)) return;
            clearTimeoutFor(id);
            rerender();
            schedule();
        },
        [clearTimeoutFor, rerender, schedule],
    );

    const fail = useCallback(
        (id: string) => {
            if (!visibleIds.current.has(id) || !mountedIds.current.has(id)) {
                return;
            }
            pendingIds.current.delete(id);
            clearTimeoutFor(id);
            mountedIds.current.delete(id);
            unavailableIds.current.add(id);
            rerender();
            schedule();
        },
        [clearTimeoutFor, rerender, schedule],
    );

    const retry = useCallback(
        (id: string) => {
            if (!visibleIds.current.has(id)) return;
            unavailableIds.current.delete(id);
            rerender();
            schedule();
        },
        [rerender, schedule],
    );

    return {
        register,
        isMounted: (id) => mountedIds.current.has(id),
        status: (id) =>
            unavailableIds.current.has(id) ? 'unavailable' : 'idle',
        complete,
        fail,
        retry,
    };
};
