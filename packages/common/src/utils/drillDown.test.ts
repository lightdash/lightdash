import { FilterOperator } from '../types/filter';
import type { MetricQuery } from '../types/metricQuery';
import type { ResultValue } from '../types/results';
import { DrillPathType, type DrillDownPath } from '../types/savedCharts';
import {
    buildDrilledMetricQuery,
    buildDrillFilters,
    mergeDrillFilters,
} from './drillDown';

describe('drillDown utilities', () => {
    describe('buildDrillFilters', () => {
        it('should create EQUALS filters for dimension values', () => {
            const fieldValues: Record<string, ResultValue> = {
                orders_status: { raw: 'completed', formatted: 'Completed' },
                orders_category: {
                    raw: 'Electronics',
                    formatted: 'Electronics',
                },
            };

            const filters = buildDrillFilters(fieldValues, [
                'orders_status',
                'orders_category',
            ]);

            expect(filters).toHaveLength(2);
            expect(filters[0]).toMatchObject({
                target: { fieldId: 'orders_status' },
                operator: FilterOperator.EQUALS,
                values: ['completed'],
            });
            expect(filters[1]).toMatchObject({
                target: { fieldId: 'orders_category' },
                operator: FilterOperator.EQUALS,
                values: ['Electronics'],
            });
        });

        it('should create NULL filter for null values', () => {
            const fieldValues: Record<string, ResultValue> = {
                orders_status: { raw: null, formatted: '-' },
            };

            const filters = buildDrillFilters(fieldValues, ['orders_status']);

            expect(filters).toHaveLength(1);
            expect(filters[0]).toMatchObject({
                target: { fieldId: 'orders_status' },
                operator: FilterOperator.NULL,
                values: undefined,
            });
        });

        it('should skip dimensions not present in fieldValues', () => {
            const fieldValues: Record<string, ResultValue> = {
                orders_status: { raw: 'completed', formatted: 'Completed' },
            };

            const filters = buildDrillFilters(fieldValues, [
                'orders_status',
                'orders_missing',
            ]);

            expect(filters).toHaveLength(1);
        });

        it('should return empty array when no dimensions match', () => {
            const filters = buildDrillFilters({}, ['orders_status']);
            expect(filters).toHaveLength(0);
        });
    });

    describe('mergeDrillFilters', () => {
        it('should merge drill filters into empty filters', () => {
            const result = mergeDrillFilters({}, [
                {
                    id: 'test-1',
                    target: { fieldId: 'orders_status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ]);

            expect(result.dimensions).toBeDefined();
            expect(result.dimensions).toHaveProperty('and');
            if (result.dimensions && 'and' in result.dimensions) {
                expect(result.dimensions.and).toHaveLength(1);
            }
        });

        it('should preserve existing dimension filters', () => {
            const existing = {
                dimensions: {
                    id: 'existing-group',
                    and: [
                        {
                            id: 'existing-filter',
                            target: { fieldId: 'orders_date' },
                            operator: FilterOperator.EQUALS as const,
                            values: ['2025-01-01'],
                        },
                    ],
                },
            };

            const result = mergeDrillFilters(existing, [
                {
                    id: 'drill-filter',
                    target: { fieldId: 'orders_status' },
                    operator: FilterOperator.EQUALS,
                    values: ['completed'],
                },
            ]);

            if (result.dimensions && 'and' in result.dimensions) {
                // Existing group + drill filter
                expect(result.dimensions.and).toHaveLength(2);
            }
        });

        it('should return existing filters unchanged when no drill filters', () => {
            const existing = { metrics: { id: 'g', and: [] } };
            const result = mergeDrillFilters(existing, []);
            expect(result).toBe(existing);
        });
    });

    describe('buildDrilledMetricQuery', () => {
        const baseQuery: MetricQuery = {
            exploreName: 'orders',
            dimensions: ['orders_status', 'orders_category'],
            metrics: ['orders_total_revenue'],
            filters: {},
            sorts: [{ fieldId: 'orders_status', descending: false }],
            limit: 500,
            tableCalculations: [
                {
                    name: 'calc',
                    displayName: 'Calc',
                    sql: '1+1',
                },
            ],
            additionalMetrics: [],
        };

        const drillPath: DrillDownPath = {
            id: 'drill-1',
            type: DrillPathType.DRILL_DOWN,
            label: 'By Region',
            dimensions: ['orders_region', 'orders_city'],
        };

        const fieldValues: Record<string, ResultValue> = {
            orders_status: { raw: 'completed', formatted: 'Completed' },
            orders_category: { raw: 'Electronics', formatted: 'Electronics' },
        };

        it('should swap dimensions to drill path dimensions', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.dimensions).toEqual(['orders_region', 'orders_city']);
        });

        it('should keep original metrics when drill path has no metric override', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.metrics).toEqual(['orders_total_revenue']);
        });

        it('should override metrics when drill path specifies them', () => {
            const pathWithMetrics: DrillDownPath = {
                ...drillPath,
                metrics: ['orders_count', 'orders_avg_revenue'],
            };

            const result = buildDrilledMetricQuery(
                baseQuery,
                pathWithMetrics,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.metrics).toEqual([
                'orders_count',
                'orders_avg_revenue',
            ]);
        });

        it('should add EQUALS filters for all original dimensions', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.filters.dimensions).toBeDefined();
            if (
                result.filters.dimensions &&
                'and' in result.filters.dimensions
            ) {
                const filterRules = result.filters.dimensions.and;
                expect(filterRules).toHaveLength(2);
            }
        });

        it('should default sort to first drill dimension ascending', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.sorts).toEqual([
                { fieldId: 'orders_region', descending: false },
            ]);
        });

        it('should use drill path sorts when provided', () => {
            const pathWithSorts: DrillDownPath = {
                ...drillPath,
                sorts: [{ fieldId: 'orders_city', descending: true }],
            };

            const result = buildDrilledMetricQuery(
                baseQuery,
                pathWithSorts,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.sorts).toEqual([
                { fieldId: 'orders_city', descending: true },
            ]);
        });

        it('should clear table calculations and custom dimensions', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.tableCalculations).toEqual([]);
            expect(result.customDimensions).toEqual([]);
        });

        it('should preserve exploreName, limit, and additionalMetrics', () => {
            const result = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(result.exploreName).toBe('orders');
            expect(result.limit).toBe(500);
            expect(result.additionalMetrics).toEqual([]);
        });

        it('should chain multi-level drills correctly', () => {
            // Level 1: original [status, category] → drill to [region, city]
            // Clicked values: status=completed, category=Electronics
            const level1 = buildDrilledMetricQuery(
                baseQuery,
                drillPath,
                fieldValues,
                baseQuery.dimensions,
            );

            expect(level1.dimensions).toEqual(['orders_region', 'orders_city']);

            // Level 2: [region, city] → drill to [source]
            // Clicked values: region=East, city=NYC
            const level2Path: DrillDownPath = {
                id: 'drill-2',
                type: DrillPathType.DRILL_DOWN,
                label: 'By Source',
                dimensions: ['orders_source'],
            };
            const level2Values: Record<string, ResultValue> = {
                orders_region: { raw: 'East', formatted: 'East' },
                orders_city: { raw: 'NYC', formatted: 'NYC' },
            };

            const level2 = buildDrilledMetricQuery(
                level1,
                level2Path,
                level2Values,
                level1.dimensions, // dimensions from previous step's output
            );

            // Should have the new drill dimensions
            expect(level2.dimensions).toEqual(['orders_source']);
            // Should keep the same metrics
            expect(level2.metrics).toEqual(['orders_total_revenue']);

            // Filters should contain BOTH level 1 and level 2 filters
            // Level 1 filters: status=completed, category=Electronics
            // Level 2 filters: region=East, city=NYC
            const filtersAnd =
                level2.filters.dimensions && 'and' in level2.filters.dimensions
                    ? level2.filters.dimensions.and
                    : [];
            // Flatten all filter rules from nested AND groups
            const allFilterRules = filtersAnd.flatMap((item) =>
                'and' in item ? item.and : [item],
            );

            const filterTargets = allFilterRules.map((f) =>
                'target' in f ? f.target.fieldId : undefined,
            );

            // Level 1 filters (from original dimensions)
            expect(filterTargets).toContain('orders_status');
            expect(filterTargets).toContain('orders_category');
            // Level 2 filters (from level 1 output dimensions)
            expect(filterTargets).toContain('orders_region');
            expect(filterTargets).toContain('orders_city');
        });
    });
});
