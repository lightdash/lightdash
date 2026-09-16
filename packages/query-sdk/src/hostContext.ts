/**
 * Identity the host rides on its `lightdash:sdk:ready` handshake: the app
 * uuid this bundle is deployed as. Absent for older hosts and for bundles run
 * outside Lightdash (CLI preview), where app-scoped host features stay off.
 */

import { useSyncExternalStore } from 'react';

const SDK_READY_MESSAGE = 'lightdash:sdk:ready';

type HostContext = { appUuid: string | null };

const EMPTY_CONTEXT: HostContext = { appUuid: null };

let value: HostContext = EMPTY_CONTEXT;
const listeners = new Set<() => void>();

const set = (next: HostContext) => {
    if (next.appUuid === value.appUuid) return;
    value = next;
    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

let activeCleanup: (() => void) | null = null;

/** Called by `createPostMessageTransport()`; one listener per bundle. */
export function mountHostContext(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};

    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data as
            | { type?: unknown; appUuid?: unknown }
            | undefined;
        if (data?.type !== SDK_READY_MESSAGE) return;
        set({
            appUuid: typeof data.appUuid === 'string' ? data.appUuid : null,
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
}
