import { FilterOperator, type MetricQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { combineFilters } from './drillDownFilters';
import type { TopGroupTuple } from './types';

const emptyMetricQuery: MetricQuery = {
    exploreName: 'test',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('combineFilters — Other group tuple exclusion', () => {
    it('builds De Morgan negation for multi-pivot Other tuples', () => {
        const topGroupTuples: TopGroupTuple[] = [
            { country: 'US', channel: 'Paid' },
            { country: 'CA', channel: 'Organic' },
        ];

        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'country',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                    {
                        field: 'channel',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
            topGroupTuples,
        });

        // Should produce: (NOT A₁ OR NOT B₁) AND (NOT A₂ OR NOT B₂)
        const andGroup = result.dimensions;
        expect(andGroup).toBeDefined();
        expect('and' in andGroup!).toBe(true);

        const filters = (andGroup as { and: unknown[] }).and;
        // 2 tuple exclusion groups
        expect(filters).toHaveLength(2);

        // First tuple: NOT (country=US AND channel=Paid) → (country≠US OR channel≠Paid)
        const tuple1 = filters[0] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            }>;
        };
        expect('or' in tuple1).toBe(true);
        expect(tuple1.or).toHaveLength(2);
        expect(tuple1.or[0].target.fieldId).toBe('country');
        expect(tuple1.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple1.or[0].values).toEqual(['US']);
        expect(tuple1.or[1].target.fieldId).toBe('channel');
        expect(tuple1.or[1].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple1.or[1].values).toEqual(['Paid']);

        // Second tuple: NOT (country=CA AND channel=Organic) → (country≠CA OR channel≠Organic)
        const tuple2 = filters[1] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            }>;
        };
        expect(tuple2.or[0].target.fieldId).toBe('country');
        expect(tuple2.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple2.or[0].values).toEqual(['CA']);
        expect(tuple2.or[1].target.fieldId).toBe('channel');
        expect(tuple2.or[1].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple2.or[1].values).toEqual(['Organic']);
    });

    it('handles single-pivot Other correctly (simplifies to NOT_EQUALS per group)', () => {
        const topGroupTuples: TopGroupTuple[] = [
            { region: 'US' },
            { region: 'EU' },
        ];

        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'region',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
            topGroupTuples,
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        expect(filters).toHaveLength(2);

        // Each is an OR group with a single NOT_EQUALS
        const tuple1 = filters[0] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            }>;
        };
        expect(tuple1.or).toHaveLength(1);
        expect(tuple1.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple1.or[0].values).toEqual(['US']);

        const tuple2 = filters[1] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            }>;
        };
        expect(tuple2.or).toHaveLength(1);
        expect(tuple2.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple2.or[0].values).toEqual(['EU']);
    });

    it('never produces EQUALS "Other" filter for Other groups', () => {
        const topGroupTuples: TopGroupTuple[] = [{ region: 'US' }];

        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'region',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
            topGroupTuples,
        });

        // Recursively check no filter has operator=EQUALS with values=['Other']
        const json = JSON.stringify(result);
        // Should contain NOT_EQUALS, not a bare EQUALS with 'Other'
        expect(json).not.toContain('"operator":"equals","values":["Other"]');
    });

    it('handles null tuple values with NOT_NULL operator', () => {
        const topGroupTuples: TopGroupTuple[] = [{ region: null }];

        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'region',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
            topGroupTuples,
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        const tuple1 = filters[0] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values?: unknown[];
            }>;
        };
        expect(tuple1.or[0].operator).toBe(FilterOperator.NOT_NULL);
        expect(tuple1.or[0].values).toBeUndefined();
    });

    it('falls back to standard EQUALS for non-Other pivot values', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [{ field: 'region', value: 'US' }],
            },
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        expect(filters).toHaveLength(1);
        const filter = filters[0] as {
            target: { fieldId: string };
            operator: string;
            values: unknown[];
        };
        expect(filter.operator).toBe(FilterOperator.EQUALS);
        expect(filter.values).toEqual(['US']);
    });

    it('handles null pivot value with NULL operator in non-Other path', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [{ field: 'region', value: null }],
            },
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        expect(filters).toHaveLength(1);
        const filter = filters[0] as {
            target: { fieldId: string };
            operator: string;
            values?: unknown[];
        };
        expect(filter.operator).toBe(FilterOperator.NULL);
        expect(filter.values).toBeUndefined();
    });

    it('handles string tuple values for year-like dimensions', () => {
        const topGroupTuples: TopGroupTuple[] = [{ year: '2024' }];

        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'year',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
            topGroupTuples,
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        expect(filters).toHaveLength(1);
        const tuple1 = filters[0] as {
            or: Array<{
                target: { fieldId: string };
                operator: string;
                values: unknown[];
            }>;
        };
        expect(tuple1.or[0].operator).toBe(FilterOperator.NOT_EQUALS);
        expect(tuple1.or[0].values).toEqual(['2024']);
    });

    it('returns contradiction filter when Other has no topGroupTuples', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: emptyMetricQuery,
            pivotReference: {
                field: 'revenue',
                pivotValues: [
                    {
                        field: 'region',
                        value: 'Other',
                        isOtherGroup: true,
                    },
                ],
            },
        });

        const andGroup = result.dimensions;
        const filters = (andGroup as { and: unknown[] }).and;
        expect(filters).toHaveLength(2);
        const [nullFilter, notNullFilter] = filters as Array<{
            target: { fieldId: string };
            operator: string;
        }>;
        expect(nullFilter.operator).toBe(FilterOperator.NULL);
        expect(notNullFilter.operator).toBe(FilterOperator.NOT_NULL);
    });
});
