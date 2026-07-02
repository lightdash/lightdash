import { toInternalFilters } from './filterConversion';
import type {
    AdditionalMetric,
    CustomDimension,
    Filter,
    InternalFilterDefinition,
    ParametersValuesMap,
    Sort,
    TableCalculation,
} from './types';

/**
 * A reference to a saved Lightdash chart, run live by UUID via
 * `POST /query/chart` instead of an inline metric query. Produced by the
 * `savedChart(uuid)` factory and accepted by `useLightdash`.
 *
 * CRITICAL: this mirrors the ENTIRE chainable `QueryBuilder` surface. Generated
 * apps chain builder methods on every query (`.dimensions().metrics().filters()
 * .sorts().label().limit()…`); calling a method that doesn't exist on a plain
 * object throws `TypeError: X is not a function` and crashes the whole app. So a
 * linked chart must be exactly as crash-safe as a normal query — every method
 * below exists and is chainable.
 *
 * A saved chart's structure is governed by the chart itself, so the structural
 * methods (dimensions/metrics/sorts/table-calcs/additional-metrics/
 * custom-dimensions) are accepted but IGNORED. `.label()`, `.limit()`,
 * `.parameters()` and `.filters()` affect the run — the `/query/chart`
 * endpoint supports them.
 *
 * If you add a method to `QueryBuilder`, add it here too (see savedChart.test.ts,
 * which chains every QueryBuilder method to guard against a missing one).
 */
export type SavedChartQuery = {
    kind: 'savedChart';
    chartUuid: string;
    /** Captured `.label()` value — surfaced in the query inspector. */
    labelText?: string;
    /** Captured `.limit()` value — sent to /query/chart. */
    limitValue?: number;
    /** Captured `.parameters()` values — sent to /query/chart. */
    parameterValues?: ParametersValuesMap;
    /** Captured .filters() — ANDed onto the chart's filters server-side. Field ids are qualified (e.g. orders_status). */
    filterValues?: InternalFilterDefinition[];

    // Honored (the /query/chart endpoint supports these):
    label: (name: string) => SavedChartQuery;
    limit: (n: number) => SavedChartQuery;
    parameters: (map: ParametersValuesMap) => SavedChartQuery;
    filters: (filters: Filter[]) => SavedChartQuery;

    // Accepted but ignored — a saved chart's structure is fixed by the chart:
    dimensions: (fields: string[]) => SavedChartQuery;
    metrics: (fields: string[]) => SavedChartQuery;
    sorts: (sorts: Sort[]) => SavedChartQuery;
    tableCalculations: (calcs: TableCalculation[]) => SavedChartQuery;
    additionalMetrics: (metrics: AdditionalMetric[]) => SavedChartQuery;
    customDimensions: (dims: CustomDimension[]) => SavedChartQuery;
};

type SavedChartState = {
    chartUuid: string;
    labelText?: string;
    limitValue?: number;
    parameterValues?: ParametersValuesMap;
    filterValues?: InternalFilterDefinition[];
};

export function savedChart(chartUuid: string, label?: string): SavedChartQuery {
    const build = (state: SavedChartState): SavedChartQuery => {
        const self: SavedChartQuery = {
            kind: 'savedChart',
            chartUuid: state.chartUuid,
            labelText: state.labelText,
            limitValue: state.limitValue,
            parameterValues: state.parameterValues,
            filterValues: state.filterValues,

            label: (name) => build({ ...state, labelText: name }),
            limit: (n) => build({ ...state, limitValue: n }),
            parameters: (map) =>
                build({
                    ...state,
                    parameterValues: {
                        ...(state.parameterValues ?? {}),
                        ...map,
                    },
                }),
            filters: (fs) =>
                build({
                    ...state,
                    filterValues: [
                        ...(state.filterValues ?? []),
                        ...toInternalFilters(fs),
                    ],
                }),

            // Structural methods: chainable no-ops (governed by the saved chart).
            dimensions: () => self,
            metrics: () => self,
            sorts: () => self,
            tableCalculations: () => self,
            additionalMetrics: () => self,
            customDimensions: () => self,
        };
        return self;
    };
    return build({ chartUuid, labelText: label });
}

/** Identity key for a saved-chart query — anything that changes the run must change the key. */
export function savedChartQueryKey(q: SavedChartQuery): string {
    return `savedChart:${q.chartUuid}:${q.limitValue ?? ''}:${JSON.stringify(
        q.parameterValues ?? {},
    )}:${JSON.stringify(q.filterValues ?? [])}`;
}
