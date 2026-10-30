/**
 * Identity and capabilities the host rides on its `lightdash:sdk:ready`
 * handshake: the app uuid this bundle is deployed as, and which negotiated
 * host features exist (`spaceCharts`). Absent for older hosts and for
 * bundles run outside Lightdash (CLI preview), where host-negotiated
 * features stay off.
 */

import { useSyncExternalStore } from 'react';

const SDK_READY_MESSAGE = 'lightdash:sdk:ready';

type HostContext = {
    appUuid: string | null;
    /** Host answers the space-charts virtual route. False for older hosts. */
    spaceCharts: boolean;
    /** A ready handshake has been seen at all. */
    ready: boolean;
};

const EMPTY_CONTEXT: HostContext = {
    appUuid: null,
    spaceCharts: false,
    ready: false,
};

let value: HostContext = EMPTY_CONTEXT;
const listeners = new Set<() => void>();
let readyResolvers: (() => void)[] = [];

const set = (next: HostContext) => {
    if (
        next.appUuid === value.appUuid &&
        next.spaceCharts === value.spaceCharts &&
        next.ready === value.ready
    )
        return;
    value = next;
    listeners.forEach((listener) => listener());
    if (next.ready) {
        readyResolvers.forEach((resolve) => resolve());
        readyResolvers = [];
    }
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/**
 * Resolves once a ready handshake has been seen, or after `timeoutMs` —
 * mirrors the fetch adapter's readiness gate so capability checks don't
 * hang on hosts that never handshake.
 */
export function waitForHostContext(timeoutMs: number): Promise<HostContext> {
    if (value.ready) return Promise.resolve(value);
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(value), timeoutMs);
        readyResolvers.push(() => {
            clearTimeout(timer);
            resolve(value);
        });
    });
}

let activeCleanup: (() => void) | null = null;

/** Called by `createPostMessageTransport()`; one listener per bundle. */
export function mountHostContext(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data as
            | { type?: unknown; appUuid?: unknown; spaceCharts?: unknown }
            | undefined;
        if (data?.type !== SDK_READY_MESSAGE) return;
        set({
            appUuid: typeof data.appUuid === 'string' ? data.appUuid : null,
            spaceCharts: data.spaceCharts === true,
            ready: true,
        });
    };

    activeCleanup?.();
    window.addEventListener('message', handler);
    const cleanup = () => {
        window.removeEventListener('message', handler);
        if (activeCleanup === cleanup) activeCleanup = null;
    };
    activeCleanup = cleanup;
    return cleanup;
}

export function useHostAppUuid(): string | null {
    return useSyncExternalStore(
        subscribe,
        () => value.appUuid,
        () => null,
    );
}

/** Test seams. */
export function peekHostContext(): HostContext {
    return value;
}

export function resetHostContext(): void {
    value = EMPTY_CONTEXT;
    readyResolvers = [];
}
