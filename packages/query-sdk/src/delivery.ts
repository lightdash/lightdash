/**
 * Delivery declarations: which of an app's queries belong in a scheduled
 * delivery. Declared during render, so they reflect live app state (global
 * filters, period pickers) rather than a static module-scope manifest.
 */

import { QueryBuilder } from './query';
import type { SavedChartQuery } from './savedChart';
import type {
    InternalFilterDefinition,
    ParametersValuesMap,
    QueryDefinition,
} from './types';

/**
 * A query declared for scheduled delivery. `label` is the tab/file name in the
 * delivery; null falls back to a positional name.
 */
export type DeliveryQuery =
    | { kind: 'query'; label: string | null; query: QueryDefinition }
    | {
          kind: 'savedChart';
          label: string | null;
          chartUuid: string;
          limit?: number;
          parameters?: ParametersValuesMap;
          filters?: InternalFilterDefinition[];
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
    if (query?.kind === 'savedChart') {
        return {
            kind: 'savedChart',
            label: name ?? query.labelText ?? null,
            chartUuid: query.chartUuid,
            limit: query.limitValue,
            parameters: query.parameterValues,
            filters: query.filterValues,
        };
    }
    // Skip rather than throw: generated apps chain builder methods freely, and
    // a delivery primitive that throws takes the whole app down.
    // eslint-disable-next-line no-console
    console.warn(
        '[lightdash] useDelivery expects a query() or savedChart() — skipping this declaration.',
    );
    return null;
}

/**
 * @deprecated Inert since the v2 delivery design: scheduled deliveries now
 * capture the app's executed queries host-side, so no declaration is needed.
 * Kept exported so apps generated while this API was advertised don't crash.
 */
export function useDelivery(
    _query: QueryBuilder | SavedChartQuery,
    _options?: { name?: string },
): void {
    // no-op
}
