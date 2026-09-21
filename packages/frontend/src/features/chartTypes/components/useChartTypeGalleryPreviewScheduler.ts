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
type PreviewState = 'loading' | 'loaded' | 'unavailable';

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
    const previewStates = useRef(new Map<string, PreviewState>());
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
        let loadingCount = [...previewStates.current.values()].filter(
            (state) => state === 'loading',
        ).length;
        for (const id of visibleIds.current) {
            if (loadingCount >= maxConcurrent) break;
            if (previewStates.current.has(id)) {
                continue;
            }
            previewStates.current.set(id, 'loading');
            loadingCount += 1;
            timeouts.current.set(
                id,
                setTimeout(() => {
                    if (previewStates.current.get(id) !== 'loading') return;
                    previewStates.current.set(id, 'unavailable');
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
            const state = previewStates.current.get(id);
            if (state !== 'unavailable') previewStates.current.delete(id);
            return wasVisible || state === 'loading' || state === 'loaded';
        },
        [clearTimeoutFor],
    );

    useEffect(
        function observeNearbyPreviews() {
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
                            changed = stop(id) || changed;
                        }
                    }
                    if (changed) rerender();
                    schedule();
                },
                { rootMargin: '200px 0px' },
            );
            const observer = observerRef.current;
            const activeTimeouts = timeouts.current;
            const activePreviewStates = previewStates.current;
            const activeVisibleIds = visibleIds.current;
            for (const element of elements.current.values())
                observer.observe(element);
            return () => {
                observer.disconnect();
                for (const timeout of activeTimeouts.values())
                    clearTimeout(timeout);
                activeTimeouts.clear();
                for (const [id, state] of activePreviewStates) {
                    if (state !== 'unavailable') activePreviewStates.delete(id);
                }
                activeVisibleIds.clear();
            };
        },
        [rerender, schedule, stop],
    );

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
                    if (stop(id)) {
                        rerender();
                        schedule();
                    }
                }
            };
            registerCallbacks.current.set(id, callback);
            return callback;
        },
        [rerender, schedule, stop],
    );

    const complete = useCallback(
        (id: string) => {
            if (previewStates.current.get(id) !== 'loading') return;
            previewStates.current.set(id, 'loaded');
            clearTimeoutFor(id);
            rerender();
            schedule();
        },
        [clearTimeoutFor, rerender, schedule],
    );

    const fail = useCallback(
        (id: string) => {
            const state = previewStates.current.get(id);
            if (
                !visibleIds.current.has(id) ||
                (state !== 'loading' && state !== 'loaded')
            ) {
                return;
            }
            clearTimeoutFor(id);
            previewStates.current.set(id, 'unavailable');
            rerender();
            schedule();
        },
        [clearTimeoutFor, rerender, schedule],
    );

    const retry = useCallback(
        (id: string) => {
            if (
                !visibleIds.current.has(id) ||
                previewStates.current.get(id) !== 'unavailable'
            )
                return;
            previewStates.current.delete(id);
            rerender();
            schedule();
        },
        [rerender, schedule],
    );

    return {
        register,
        isMounted: (id) => {
            const state = previewStates.current.get(id);
            return state === 'loading' || state === 'loaded';
        },
        status: (id) =>
            previewStates.current.get(id) === 'unavailable'
                ? 'unavailable'
                : 'idle',
        complete,
        fail,
        retry,
    };
};
