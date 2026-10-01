/// <reference types="vitest/globals" />
import {
    FilterOperator,
    type AndFilterGroup,
    type DashboardFilters,
    type MetricQuery,
} from '@lightdash/common';
import { combineFilters } from './combineFilters';

vi.mock('uuid', () => ({
    v4: vi.fn(() => 'test-uuid'),
}));

const baseMetricQuery: MetricQuery = {
    exploreName: 'test',
    limit: 500,
    dimensions: ['dim1'],
    metrics: ['metric1'],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'dim-group',
            and: [
                {
                    id: 'f1',
                    target: { fieldId: 'dim1' },
                    operator: FilterOperator.EQUALS,
                    values: ['a'],
                },
            ],
        },
    },
};

const metricQueryWithMetricFilters: MetricQuery = {
    ...baseMetricQuery,
    filters: {
        ...baseMetricQuery.filters,
        metrics: {
            id: 'metric-group',
            and: [
                {
                    id: 'mf1',
                    target: { fieldId: 'metric1' },
                    operator: FilterOperator.GREATER_THAN,
                    values: [100],
                },
            ],
        },
    },
};

const dashboardFiltersWithMetrics: DashboardFilters = {
    dimensions: [
        {
            id: 'df1',
            label: undefined,
            target: { fieldId: 'dim1', tableName: 'test' },
            operator: FilterOperator.EQUALS,
            values: ['b'],
        },
    ],
    metrics: [
        {
            id: 'dmf1',
            label: undefined,
            target: { fieldId: 'metric1', tableName: 'test' },
            operator: FilterOperator.LESS_THAN,
            values: [500],
        },
    ],
    tableCalculations: [],
};

const emptyDashboardFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

describe('combineFilters', () => {
    test('should include dashboard metric filters in returned Filters', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: baseMetricQuery,
            dashboardFilters: dashboardFiltersWithMetrics,
        });

        expect(result.dimensions).toBeDefined();
        expect(result.metrics).toBeDefined();
        expect((result.metrics as AndFilterGroup).and).toContainEqual(
            expect.objectContaining({
                target: { fieldId: 'metric1', tableName: 'test' },
                operator: FilterOperator.LESS_THAN,
                values: [500],
            }),
        );
    });

    test('should include metric query metric filters alongside dashboard metric filters', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: metricQueryWithMetricFilters,
            dashboardFilters: dashboardFiltersWithMetrics,
        });

        expect(result.metrics).toBeDefined();
        expect((result.metrics as AndFilterGroup).and).toHaveLength(2);
    });

    test('should not include metrics key when no metric filters exist', () => {
        const result = combineFilters({
            fieldValues: {},
            metricQuery: baseMetricQuery,
            dashboardFilters: emptyDashboardFilters,
        });

        expect(result.dimensions).toBeDefined();
        expect(result.metrics).toBeUndefined();
    });

    test('should preserve dimension filter behavior when adding metric filters', () => {
        const result = combineFilters({
            fieldValues: { dim1: { raw: 'val', formatted: 'val' } },
            metricQuery: baseMetricQuery,
            dashboardFilters: dashboardFiltersWithMetrics,
        });

        expect(result.dimensions).toBeDefined();
        // Should have: chart dimension filter + dashboard dimension filter + fieldValue dimension filter
        expect(
            (result.dimensions as AndFilterGroup).and.length,
        ).toBeGreaterThanOrEqual(3);
    });

    describe('source filter groups', () => {
        test('spreads rules of an and group instead of nesting it', () => {
            const result = combineFilters({
                fieldValues: {},
                metricQuery: metricQueryWithMetricFilters,
                extraFilters: {
                    dimensions: {
                        id: 'extra-dim-group',
                        and: [
                            {
                                id: 'ef1',
                                target: { fieldId: 'dim2' },
                                operator: FilterOperator.EQUALS,
                                values: ['b'],
                            },
                        ],
                    },
                    metrics: {
                        id: 'extra-metric-group',
                        and: [
                            {
                                id: 'emf1',
                                target: { fieldId: 'metric1' },
                                operator: FilterOperator.LESS_THAN,
                                values: [500],
                            },
                        ],
                    },
                },
            });

            expect(result.dimensions).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'f1',
                        target: { fieldId: 'dim1' },
                        operator: FilterOperator.EQUALS,
                        values: ['a'],
                    },
                    {
                        id: 'ef1',
                        target: { fieldId: 'dim2' },
                        operator: FilterOperator.EQUALS,
                        values: ['b'],
                    },
                ],
            });
            expect(result.metrics).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'mf1',
                        target: { fieldId: 'metric1' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [100],
                    },
                    {
                        id: 'emf1',
                        target: { fieldId: 'metric1' },
                        operator: FilterOperator.LESS_THAN,
                        values: [500],
                    },
                ],
            });
        });

        test('keeps or groups wrapped', () => {
            const result = combineFilters({
                fieldValues: {},
                metricQuery: {
                    ...baseMetricQuery,
                    filters: {
                        dimensions: {
                            id: 'or-group',
                            or: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'dim1' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['a'],
                                },
                                {
                                    id: 'f2',
                                    target: { fieldId: 'dim2' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['b'],
                                },
                            ],
                        },
                    },
                },
            });

            expect(result.dimensions).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'or-group',
                        or: [
                            {
                                id: 'f1',
                                target: { fieldId: 'dim1' },
                                operator: FilterOperator.EQUALS,
                                values: ['a'],
                            },
                            {
                                id: 'f2',
                                target: { fieldId: 'dim2' },
                                operator: FilterOperator.EQUALS,
                                values: ['b'],
                            },
                        ],
                    },
                ],
            });
        });

        test('combines or groups with extra filters and the drilled row', () => {
            const result = combineFilters({
                fieldValues: { dim1: { raw: 'val', formatted: 'val' } },
                metricQuery: {
                    ...baseMetricQuery,
                    filters: {
                        dimensions: {
                            id: 'or-group',
                            or: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'dim1' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['a'],
                                },
                                {
                                    id: 'f2',
                                    target: { fieldId: 'dim2' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['b'],
                                },
                            ],
                        },
                        metrics: {
                            id: 'metric-group',
                            and: [
                                {
                                    id: 'mf1',
                                    target: { fieldId: 'metric1' },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [100],
                                },
                            ],
                        },
                    },
                },
                extraFilters: {
                    dimensions: {
                        id: 'extra-dim-group',
                        and: [
                            {
                                id: 'ef1',
                                target: { fieldId: 'dim3' },
                                operator: FilterOperator.EQUALS,
                                values: ['c'],
                            },
                        ],
                    },
                    metrics: {
                        id: 'extra-metric-or-group',
                        or: [
                            {
                                id: 'emf1',
                                target: { fieldId: 'metric1' },
                                operator: FilterOperator.LESS_THAN,
                                values: [500],
                            },
                            {
                                id: 'emf2',
                                target: { fieldId: 'metric1' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [1000],
                            },
                        ],
                    },
                },
            });

            expect(result.dimensions).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'or-group',
                        or: [
                            {
                                id: 'f1',
                                target: { fieldId: 'dim1' },
                                operator: FilterOperator.EQUALS,
                                values: ['a'],
                            },
                            {
                                id: 'f2',
                                target: { fieldId: 'dim2' },
                                operator: FilterOperator.EQUALS,
                                values: ['b'],
                            },
                        ],
                    },
                    {
                        id: 'ef1',
                        target: { fieldId: 'dim3' },
                        operator: FilterOperator.EQUALS,
                        values: ['c'],
                    },
                    {
                        id: 'test-uuid',
                        target: { fieldId: 'dim1' },
                        operator: FilterOperator.EQUALS,
                        values: ['val'],
                    },
                ],
            });
            expect(result.metrics).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'mf1',
                        target: { fieldId: 'metric1' },
                        operator: FilterOperator.GREATER_THAN,
                        values: [100],
                    },
                    {
                        id: 'extra-metric-or-group',
                        or: [
                            {
                                id: 'emf1',
                                target: { fieldId: 'metric1' },
                                operator: FilterOperator.LESS_THAN,
                                values: [500],
                            },
                            {
                                id: 'emf2',
                                target: { fieldId: 'metric1' },
                                operator: FilterOperator.GREATER_THAN,
                                values: [1000],
                            },
                        ],
                    },
                ],
            });
        });

        test('drops empty groups', () => {
            const result = combineFilters({
                fieldValues: {},
                metricQuery: {
                    ...baseMetricQuery,
                    filters: {
                        dimensions: {
                            id: 'dim-group',
                            and: [
                                {
                                    id: 'f1',
                                    target: { fieldId: 'dim1' },
                                    operator: FilterOperator.EQUALS,
                                    values: ['a'],
                                },
                                { id: 'empty-and-group', and: [] },
                                { id: 'empty-or-group', or: [] },
                            ],
                        },
                        metrics: { id: 'empty-metric-group', and: [] },
                    },
                },
                extraFilters: {
                    dimensions: { id: 'empty-extra-group', or: [] },
                },
            });

            expect(result.dimensions).toEqual({
                id: 'test-uuid',
                and: [
                    {
                        id: 'f1',
                        target: { fieldId: 'dim1' },
                        operator: FilterOperator.EQUALS,
                        values: ['a'],
                    },
                ],
            });
            expect(result.metrics).toBeUndefined();
        });
    });
});
