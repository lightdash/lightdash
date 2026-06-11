import {
    type Filters,
    type MetricQuery,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { SubtotalsCalculator } from './SubtotalsCalculator';

const EMPTY_FILTERS: Filters = {};

const buildMetricQuery = (
    overrides: Partial<MetricQuery> = {},
): MetricQuery => ({
    exploreName: 'events',
    dimensions: ['events_event_tier', 'events_event_type', 'events_country'],
    metrics: ['events_total_count'],
    filters: EMPTY_FILTERS,
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const SORT: SortField = {
    fieldId: 'events_country',
    descending: false,
};

const TC_REFERENCING_DIMENSION: TableCalculation = {
    name: 'is_high_tier',
    displayName: 'Is high tier',
    sql: "CASE WHEN ${events.event_tier} = 'High' THEN 1 ELSE 0 END",
};

const TC_REFERENCING_METRIC: TableCalculation = {
    name: 'count_doubled',
    displayName: 'Count doubled',
    sql: '${events.total_count} * 2',
};

describe('SubtotalsCalculator (#14187)', () => {
    describe('createSubtotalQueryConfig — sort stripping (#14298)', () => {
        it('drops sorts from the subtotal query even when input metricQuery sorts the removed dimension', () => {
            // Repro: sorting by the last dimension (which is excluded from subtotal
            // groups) made the subtotal query reference an unselected column and
            // crash. Fix: subtotal queries must never carry sorts.
            const baseMetricQuery = buildMetricQuery({ sorts: [SORT] });

            const result = SubtotalsCalculator.createSubtotalQueryConfig(
                baseMetricQuery,
                ['events_event_tier', 'events_event_type'],
            );

            expect(result.metricQuery.sorts).toEqual([]);
        });

        it('drops sorts even when input metricQuery has multiple sorts', () => {
            const baseMetricQuery = buildMetricQuery({
                sorts: [
                    SORT,
                    { fieldId: 'events_event_type', descending: true },
                ],
            });

            const result = SubtotalsCalculator.createSubtotalQueryConfig(
                baseMetricQuery,
                ['events_event_tier'],
            );

            expect(result.metricQuery.sorts).toEqual([]);
        });

        it('includes pivotDimensions in the subtotal dimensions', () => {
            const baseMetricQuery = buildMetricQuery();

            const result = SubtotalsCalculator.createSubtotalQueryConfig(
                baseMetricQuery,
                ['events_event_tier'],
                ['events_event_type'],
            );

            expect(result.dimensions).toEqual([
                'events_event_tier',
                'events_event_type',
            ]);
            expect(result.metricQuery.dimensions).toEqual([
                'events_event_tier',
                'events_event_type',
            ]);
        });
    });

    describe('filterTableCalculations — TC referencing unavailable field (#14403)', () => {
        it('excludes a table calculation referencing a dimension absent from subtotal dimensions', () => {
            // Repro: a TC like CASE WHEN ${events.event_tier} = 'High' references a
            // dimension that gets dropped from the subtotal grouping. Before the fix,
            // the subtotal query was issued with the TC anyway and SQL compilation
            // failed because the dimension column didn't exist in the SELECT.
            const baseMetricQuery = buildMetricQuery({
                tableCalculations: [TC_REFERENCING_DIMENSION],
            });

            const filtered = SubtotalsCalculator.filterTableCalculations(
                baseMetricQuery,
                // event_tier intentionally absent
                ['events_event_type', 'events_country'],
            );

            expect(filtered).toEqual([]);
        });

        it('keeps a table calculation when its referenced dimension is in subtotal dimensions', () => {
            const baseMetricQuery = buildMetricQuery({
                tableCalculations: [TC_REFERENCING_DIMENSION],
            });

            const filtered = SubtotalsCalculator.filterTableCalculations(
                baseMetricQuery,
                ['events_event_tier', 'events_event_type'],
            );

            expect(filtered).toEqual([TC_REFERENCING_DIMENSION]);
        });

        it('keeps a table calculation referencing a metric (metrics survive subtotal grouping)', () => {
            const baseMetricQuery = buildMetricQuery({
                tableCalculations: [TC_REFERENCING_METRIC],
            });

            const filtered = SubtotalsCalculator.filterTableCalculations(
                baseMetricQuery,
                // dimensions list omits any dim — the TC references a metric, not a dim
                ['events_event_tier'],
            );

            expect(filtered).toEqual([TC_REFERENCING_METRIC]);
        });

        it('preserves only the safe TCs when a mix is supplied', () => {
            const baseMetricQuery = buildMetricQuery({
                tableCalculations: [
                    TC_REFERENCING_DIMENSION, // references events_event_tier (dropped)
                    TC_REFERENCING_METRIC, // references events_total_count (kept)
                ],
            });

            const filtered = SubtotalsCalculator.filterTableCalculations(
                baseMetricQuery,
                ['events_event_type'],
            );

            expect(filtered).toEqual([TC_REFERENCING_METRIC]);
        });
    });

    describe('createSubtotalQueryConfig — combined invariants', () => {
        it('returns sorts:[] AND filters TCs with missing field refs in a single call', () => {
            const baseMetricQuery = buildMetricQuery({
                sorts: [SORT],
                tableCalculations: [
                    TC_REFERENCING_DIMENSION,
                    TC_REFERENCING_METRIC,
                ],
            });

            const result = SubtotalsCalculator.createSubtotalQueryConfig(
                baseMetricQuery,
                ['events_event_type'],
            );

            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([
                TC_REFERENCING_METRIC,
            ]);
            expect(result.tableCalculations).toEqual([TC_REFERENCING_METRIC]);
        });
    });
});
