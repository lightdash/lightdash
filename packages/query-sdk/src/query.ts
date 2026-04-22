/**
 * Chainable query builder.
 *
 * Usage:
 *   query('orders')
 *     .dimensions(['customer_segment', 'order_date'])
 *     .metrics(['total_revenue', 'order_count'])
 *     .filters([{ field: 'order_date', operator: 'inThePast', value: 90, unit: 'days' }])
 *     .sorts([{ field: 'total_revenue', direction: 'desc' }])
 *     .limit(100)
 *
 * The builder is immutable -- each method returns a new instance.
 */

import type {
    AdditionalMetric,
    CustomDimension,
    Filter,
    InternalFilterDefinition,
    QueryDefinition,
    Sort,
    TableCalculation,
} from './types';

type BuilderState = {
    explore: string;
    dimensions: string[];
    metrics: string[];
    filters: InternalFilterDefinition[];
    sorts: { fieldId: string; descending: boolean }[];
    tableCalculations: TableCalculation[];
    additionalMetrics: AdditionalMetric[];
    customDimensions: CustomDimension[];
    limit: number;
    label: string | undefined;
};

/**
 * Create a query builder for a model.
 *
 * Usage:
 *   query('orders')
 *     .dimensions(['customer_segment'])
 *     .metrics(['total_revenue'])
 *     .limit(100)
 */
export function query(modelName: string): QueryBuilder {
    return new QueryBuilder(modelName);
}

export class QueryBuilder {
    private readonly _state: BuilderState;

    constructor(explore: string);
    constructor(state: BuilderState);
    constructor(exploreOrState: string | BuilderState) {
        if (typeof exploreOrState === 'string') {
            this._state = {
                explore: exploreOrState,
                dimensions: [],
                metrics: [],
                filters: [],
                sorts: [],
                tableCalculations: [],
                additionalMetrics: [],
                customDimensions: [],
                limit: 500,
                label: undefined,
            };
        } else {
            this._state = exploreOrState;
        }
    }

    private _clone(overrides: Partial<BuilderState>): QueryBuilder {
        return new QueryBuilder({ ...this._state, ...overrides });
    }

    /** Human-readable label for dev tools / query inspector */
    label(name: string): QueryBuilder {
        return this._clone({ label: name });
    }

    /** Set dimension fields (GROUP BY columns) */
    dimensions(fields: string[]): QueryBuilder {
        return this._clone({
            dimensions: [...this._state.dimensions, ...fields],
        });
    }

    /** Set metric fields (aggregations) */
    metrics(fields: string[]): QueryBuilder {
        return this._clone({
            metrics: [...this._state.metrics, ...fields],
        });
    }

    /** Add filters */
    filters(filters: Filter[]): QueryBuilder {
        const converted: InternalFilterDefinition[] = filters.map((f) => {
            const values: (string | number | boolean)[] = [];
            if (f.value !== undefined) {
                if (Array.isArray(f.value)) {
                    values.push(...f.value);
                } else {
                    values.push(f.value);
                }
            }

            return {
                fieldId: f.field,
                operator: f.operator,
                values,
                settings: f.unit ? { unitOfTime: f.unit } : null,
            };
        });

        return this._clone({
            filters: [...this._state.filters, ...converted],
        });
    }

    /** Add sorts */
    sorts(sorts: Sort[]): QueryBuilder {
        const converted = sorts.map((s) => ({
            fieldId: s.field,
            descending: s.direction === 'desc',
        }));

        return this._clone({
            sorts: [...this._state.sorts, ...converted],
        });
    }

    /** Add table calculations (computed columns evaluated after the query) */
    tableCalculations(calcs: TableCalculation[]): QueryBuilder {
        return this._clone({
            tableCalculations: [...this._state.tableCalculations, ...calcs],
        });
    }

    /**
     * Add additional metrics (ad-hoc aggregations defined at query time).
     * Use this for metrics on joined tables or custom aggregations not in the YAML.
     */
    additionalMetrics(metrics: AdditionalMetric[]): QueryBuilder {
        return this._clone({
            additionalMetrics: [...this._state.additionalMetrics, ...metrics],
        });
    }

    /**
     * Add custom dimensions (ad-hoc dimensions defined at query time).
     */
    customDimensions(dims: CustomDimension[]): QueryBuilder {
        return this._clone({
            customDimensions: [...this._state.customDimensions, ...dims],
        });
    }

    /** Set the maximum number of rows to return (default: 500) */
    limit(n: number): QueryBuilder {
        return this._clone({ limit: n });
    }

    /** Convert to a plain QueryDefinition object */
    build(): QueryDefinition {
        return {
            exploreName: this._state.explore,
            dimensions: this._state.dimensions,
            metrics: this._state.metrics,
            filters: this._state.filters,
            sorts: this._state.sorts,
            tableCalculations: this._state.tableCalculations,
            additionalMetrics: this._state.additionalMetrics,
            customDimensions: this._state.customDimensions,
            limit: this._state.limit,
            ...(this._state.label ? { label: this._state.label } : {}),
        };
    }
}
