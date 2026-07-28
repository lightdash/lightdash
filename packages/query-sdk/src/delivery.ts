/**
 * Delivery declarations: which of an app's queries belong in a scheduled
 * delivery. Declared during render, so they reflect live app state (global
 * filters, period pickers) rather than a static module-scope manifest.
 */

import { useEffect, useMemo, useRef } from 'react';
import { QueryBuilder } from './query';
import { savedChartQueryKey, type SavedChartQuery } from './savedChart';
import type { QueryDefinition } from './types';

export type DeliveryQuery = {
    kind: 'query';
    /** Tab/file name in the delivery. Null falls back to a positional name. */
    label: string | null;
    query: QueryDefinition;
};

export function toDeliveryQuery(
    query: QueryBuilder | SavedChartQuery,
    name?: string,
): DeliveryQuery | null {
    if (query instanceof QueryBuilder) {
        const built = query.build();
        return {
            kind: 'query',
            label: name ?? built.label ?? null,
            query: built,
        };
    }
    // Skip rather than throw: generated apps chain builder methods freely, and
    // a delivery primitive that throws takes the whole app down.
    // eslint-disable-next-line no-console
    console.warn(
        '[lightdash] useDelivery does not support linked saved charts yet — skipping this query.',
    );
    return null;
}

export const DELIVERY_AVAILABLE_MESSAGE_TYPE = 'lightdash:delivery:available';

export type DeliveryAvailableMessage = {
    type: typeof DELIVERY_AVAILABLE_MESSAGE_TYPE;
    queries: DeliveryQuery[];
};

// Insertion-ordered: Map preserves it, and that order becomes the tab/file
// order in the delivery.
const registry = new Map<string, DeliveryQuery>();

// Every mounted useDelivery publishes on mount, so a page with N declared
// queries would post N times with a growing set. Coalescing collapses that to
// one message carrying the settled set.
const PUBLISH_COALESCE_MS = 0;
let publishTimer: ReturnType<typeof setTimeout> | null = null;

export function registerDeliveryQuery(
    id: string,
    declaration: DeliveryQuery,
): void {
    registry.set(id, declaration);
}

export function unregisterDeliveryQuery(id: string): void {
    registry.delete(id);
}

export function getDeliveryQueries(): DeliveryQuery[] {
    return [...registry.values()];
}

/** Test-only: clears module state between cases. */
export function resetDeliveryRegistry(): void {
    registry.clear();
    if (publishTimer !== null) {
        clearTimeout(publishTimer);
        publishTimer = null;
    }
}

/**
 * Announce the declared set to the host. Silent while the registry is empty —
 * an unconditional announce would unlock a data delivery format for an app
 * that declares nothing, which is the lineage failure mode (see lineage.ts).
 *
 * The registry is read when the timer fires, not when it is scheduled, so a
 * declaration registered and removed within one tick never reaches the host.
 */
export function publishDeliveryQueries(target: Window): void {
    if (typeof window === 'undefined') return;
    if (publishTimer !== null) return;
    publishTimer = setTimeout(() => {
        publishTimer = null;
        const queries = getDeliveryQueries();
        if (queries.length === 0) return;
        // Bundles are served from the host page's own origin, and
        // location.origin is URL-derived so it survives the sandboxed
        // (opaque-origin) iframe.
        const { origin } = window.location;
        const targetOrigin = origin && origin !== 'null' ? origin : '*';
        const message: DeliveryAvailableMessage = {
            type: DELIVERY_AVAILABLE_MESSAGE_TYPE,
            queries,
        };
        target.postMessage(message, targetOrigin);
    }, PUBLISH_COALESCE_MS);
}

let idCounter = 0;

export function nextDeliveryId(): string {
    idCounter += 1;
    return `delivery-${idCounter}`;
}

/**
 * Declare that this query's results belong in the app's scheduled deliveries.
 * Call it alongside the `useLightdash(q)` that renders the same query.
 */
export function useDelivery(
    query: QueryBuilder | SavedChartQuery,
    options?: { name?: string },
): void {
    const idRef = useRef<string | null>(null);
    if (idRef.current === null) idRef.current = nextDeliveryId();
    const id = idRef.current;
    const name = options?.name;

    const queryKey = useMemo(
        () =>
            query instanceof QueryBuilder
                ? JSON.stringify(query.build())
                : savedChartQueryKey(query),
        [query],
    );

    useEffect(() => {
        const declaration = toDeliveryQuery(query, name);
        if (declaration) {
            registerDeliveryQuery(id, declaration);
        } else {
            unregisterDeliveryQuery(id);
        }
        if (typeof window !== 'undefined' && window.parent !== window) {
            publishDeliveryQueries(window.parent);
        }
        return () => {
            unregisterDeliveryQuery(id);
        };
        // queryKey tracks query identity. query is intentionally omitted.
    }, [id, queryKey, name]); // eslint-disable-line
}
