/**
 * Drill-down helper — builds a new query from a clicked row.
 *
 * Usage:
 *   const dq = drillDown({
 *       sourceQuery: revenueBySegment,
 *       metric: 'total_revenue',
 *       dimension: 'order_date',
 *       row: clickedRow,
 *   });
 *   // Pass dq to useLightdash() to execute
 */

import { QueryBuilder } from './query';
import type { Filter, Row } from './types';

export type DrillDownOptions = {
    /** The original query builder that produced the data */
    sourceQuery: QueryBuilder;
    /** The metric to drill into */
    metric: string;
    /** The dimension to drill by */
    dimension: string;
    /** The clicked row — its dimension values become equality filters */
    row: Row;
    /** Optional label for the drill query (shown in query inspector) */
    label?: string;
};

/**
 * Build a drill-down query from a clicked row.
 *
 * Takes the source query's dimension values from the clicked row and turns
 * them into equality filters, then queries the same metric grouped by the
 * chosen drill-by dimension.
 *
 * Returns a new QueryBuilder that can be passed to useLightdash().
 */
export function drillDown(options: DrillDownOptions): QueryBuilder {
    const { sourceQuery, metric, dimension, row, label } = options;
    const sourceDef = sourceQuery.build();

    // Build equality filters from the clicked row's dimension values
    const rowFilters: Filter[] = sourceDef.dimensions.map((dimFieldId) => {
        const value = row[dimFieldId];
        if (value === null || value === undefined) {
            return { field: dimFieldId, operator: 'isNull' as const };
        }
        return {
            field: dimFieldId,
            operator: 'equals' as const,
            value: value as string | number | boolean,
        };
    });

    // Carry forward existing filters from the source query
    const sourceFilters: Filter[] = sourceDef.filters.map((f) => ({
        field: f.fieldId,
        operator: f.operator as Filter['operator'],
        ...(f.values.length > 0
            ? { value: f.values.length === 1 ? f.values[0] : f.values }
            : {}),
        ...(f.settings?.unitOfTime ? { unit: f.settings.unitOfTime } : {}),
    }));

    return new QueryBuilder(sourceDef.exploreName)
        .label(label ?? `[Drill down] ${metric} by ${dimension}`)
        .dimensions([dimension])
        .metrics([metric])
        .filters([...sourceFilters, ...rowFilters])
        .sorts([{ field: dimension, direction: 'asc' }])
        .limit(500);
}
