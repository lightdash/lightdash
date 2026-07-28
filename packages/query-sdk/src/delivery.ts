/**
 * Delivery declarations: which of an app's queries belong in a scheduled
 * delivery. Declared during render, so they reflect live app state (global
 * filters, period pickers) rather than a static module-scope manifest.
 */

import { QueryBuilder } from './query';
import type { SavedChartQuery } from './savedChart';
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
