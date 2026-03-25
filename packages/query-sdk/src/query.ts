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
    Filter,
    InternalFilterDefinition,
    QueryDefinition,
    Sort,
} from './types';

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
    private readonly _explore: string;
    private readonly _dimensions: string[];
    private readonly _metrics: string[];
    private readonly _filters: InternalFilterDefinition[];
    private readonly _sorts: { fieldId: string; descending: boolean }[];
    private readonly _limit: number;

    constructor(
        explore: string,
        dimensions: string[] = [],
        metrics: string[] = [],
        filters: InternalFilterDefinition[] = [],
        sorts: { fieldId: string; descending: boolean }[] = [],
        limit: number = 500,
    ) {
        this._explore = explore;
        this._dimensions = dimensions;
        this._metrics = metrics;
        this._filters = filters;
        this._sorts = sorts;
        this._limit = limit;
    }

    /** Set dimension fields (GROUP BY columns) */
    dimensions(fields: string[]): QueryBuilder {
        return new QueryBuilder(
            this._explore,
            [...this._dimensions, ...fields],
            this._metrics,
            this._filters,
            this._sorts,
            this._limit,
        );
    }

    /** Set metric fields (aggregations) */
    metrics(fields: string[]): QueryBuilder {
        return new QueryBuilder(
            this._explore,
            this._dimensions,
            [...this._metrics, ...fields],
            this._filters,
            this._sorts,
            this._limit,
        );
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

        return new QueryBuilder(
            this._explore,
            this._dimensions,
            this._metrics,
            [...this._filters, ...converted],
            this._sorts,
            this._limit,
        );
    }

    /** Add sorts */
    sorts(sorts: Sort[]): QueryBuilder {
        const converted = sorts.map((s) => ({
            fieldId: s.field,
            descending: s.direction === 'desc',
        }));

        return new QueryBuilder(
            this._explore,
            this._dimensions,
            this._metrics,
            this._filters,
            [...this._sorts, ...converted],
            this._limit,
        );
    }

    /** Set the maximum number of rows to return (default: 500) */
    limit(n: number): QueryBuilder {
        return new QueryBuilder(
            this._explore,
            this._dimensions,
            this._metrics,
            this._filters,
            this._sorts,
            n,
        );
    }

    /** Convert to a plain QueryDefinition object */
    build(): QueryDefinition {
        return {
            exploreName: this._explore,
            dimensions: this._dimensions,
            metrics: this._metrics,
            filters: this._filters,
            sorts: this._sorts,
            limit: this._limit,
        };
    }
}
