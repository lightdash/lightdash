/**
 * Delivery-render flag — true when this app is being captured for a
 * scheduled delivery or its preview, instead of an interactive load. Data
 * apps mount tabs/slides lazily, so unvisited tabs' queries never run on an
 * interactive load; capture renders need every tab's data mounted so the
 * captured manifest covers all of them.
 *
 * The host rides `deliveryRender: true` on its `lightdash:sdk:ready` message
 * (absent, never `false`, on ordinary loads). Mirrors `manifest.ts`'s
 * ready-listener: one listener per bundle, event.source-gated to the host
 * window, replaced (not stacked) on remount.
 */

import { useSyncExternalStore } from 'react';

const SDK_READY_MESSAGE = 'lightdash:sdk:ready';

export type DeliveryRenderStore = {
    getValue: () => boolean;
    setValue: (next: boolean) => void;
    subscribe: (listener: () => void) => () => void;
};

/**
 * Minimal external store: synchronous reads for useSyncExternalStore.
 * Exported for tests — app code uses `useDeliveryRender`.
 */
export function createDeliveryRenderStore(): DeliveryRenderStore {
    let value = false;
    const listeners = new Set<() => void>();

    return {
        getValue: () => value,
        setValue: (next) => {
            if (next === value) return;
            value = next;
            listeners.forEach((listener) => listener());
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

// Lazily created so tests (and SSR) never touch window at import time.
let sharedStore: DeliveryRenderStore | null = null;
function getSharedStore(): DeliveryRenderStore {
    if (sharedStore === null) {
        sharedStore = createDeliveryRenderStore();
    }
    return sharedStore;
}

let activeCleanup: (() => void) | null = null;

/**
 * Listen for the flag riding on the host's `lightdash:sdk:ready`. Called by
 * `createPostMessageTransport()`; a no-op outside the browser (SSR/tests that
 * never create a postMessage transport keep the default `false`). One
 * listener per bundle — re-mounting replaces the previous listener rather
 * than stacking.
 */
export function mountDeliveryRender(targetWindow: Window): () => void {
    if (typeof window === 'undefined') return () => {};
    const store = getSharedStore();

    const handler = (event: MessageEvent) => {
        if (event.source !== targetWindow) return;
        const data = event.data as
            | { type?: unknown; deliveryRender?: unknown }
            | undefined;
        if (data?.type !== SDK_READY_MESSAGE) return;
        store.setValue(data.deliveryRender === true);
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

/**
 * True inside delivery/preview capture renders. Gate DATA fetching on this —
 * mount every tab's/slide's data hooks and show only the active one — never
 * mount all tabs unconditionally on interactive loads.
 *
 *   const deliveryRender = useDeliveryRender();
 *   return (deliveryRender || activeTab === 'summary') && <SummaryTabData />;
 */
export function useDeliveryRender(): boolean {
    const store = getSharedStore();
    return useSyncExternalStore(store.subscribe, store.getValue, () => false);
}

/** Non-hook accessor for non-component code (module init, event handlers). */
export function isDeliveryRender(): boolean {
    return getSharedStore().getValue();
}

/**
 * Test-only seam: drops the listener and the shared store so the next mount
 * re-reads the default `false`.
 */
export function resetDeliveryRenderState(): void {
    activeCleanup?.();
    sharedStore = null;
}
