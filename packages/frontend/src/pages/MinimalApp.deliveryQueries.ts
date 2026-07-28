import { type DeliveryQuery } from '@lightdash/common';

/**
 * Where the headless render publishes the app's declared delivery queries.
 * Read by UnfurlService via page.evaluate — keep the name in sync with the
 * backend resolver.
 */
export const DELIVERY_QUERIES_GLOBAL = '__lightdashAppDeliveryQueries';

export function publishDeliveryQueriesToWindow(queries: DeliveryQuery[]): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>)[DELIVERY_QUERIES_GLOBAL] =
        queries;
}

export function readDeliveryQueriesFromWindow(): DeliveryQuery[] {
    if (typeof window === 'undefined') return [];
    const value = (window as unknown as Record<string, unknown>)[
        DELIVERY_QUERIES_GLOBAL
    ];
    return Array.isArray(value) ? (value as DeliveryQuery[]) : [];
}
