import { ConditionalOperator } from '../types/conditionalRule';
import {
    FilterOperator,
    type AndFilterGroup,
    type DashboardFilters,
    type FilterRule,
    type OrFilterGroup,
} from '../types/filter';
import type { MetricQuery } from '../types/metricQuery';

export const chartAndFilterGroup: AndFilterGroup = {
    id: 'fillter-group-1',
    and: [
        {
            id: '1',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
        {
            id: '2',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
    ],
};

export const chartOrFilterGroup: OrFilterGroup = {
    id: 'fillter-group-1',
    or: [
        {
            id: '3',
            target: { fieldId: 'field-1' },
            values: ['1'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
        {
            id: '4',
            target: { fieldId: 'field-2' },
            values: ['2'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        },
    ],
};

export const dashboardFilterWithSameTargetAndOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: ConditionalOperator.EQUALS,
    },
];

export const dashboardFilterWithSameTargetButDifferentOperator: FilterRule[] = [
    {
        id: '5',
        target: { fieldId: 'field-1' },
        values: ['1', '2', '3'],
        disabled: false,
        operator: ConditionalOperator.NOT_EQUALS,
    },
];

export const metricQueryWithAndFilters: MetricQuery = {
    exploreName: 'test',
    limit: 501,
    dimensions: ['a_dim1'],
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: '1',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
};

export const metricQueryWithOrFilters: MetricQuery = {
    exploreName: 'test',
    limit: 501,
    dimensions: ['a_dim1'],
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            id: 'root',
            or: [
                {
                    id: '1',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: [0],
                },
            ],
        },
    },
};

export const dashboardFilters: DashboardFilters = {
    dimensions: [
        {
            id: '4',
            label: undefined,
            target: {
                fieldId: 'a_dim1',
                tableName: 'test',
            },
            operator: ConditionalOperator.EQUALS,
            values: ['1', '2', '3'],
        },
    ],
    metrics: [],
    tableCalculations: [],
};

export const expectedChartWithMergedDashboardFilters: MetricQuery = {
    exploreName: 'test',
    dimensions: ['a_dim1'],
    limit: 501,
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            and: [
                {
                    id: 'root',
                    and: [
                        {
                            id: '1',
                            target: {
                                fieldId: 'a_dim1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: [0],
                        },
                    ],
                },
                {
                    id: '4',
                    target: { fieldId: 'a_dim1' },
                    operator: ConditionalOperator.EQUALS,
                    values: ['1', '2', '3'],
                },
            ],
            id: 'uuid',
        },
        metrics: {
            and: [],
            id: 'uuid',
        },
        tableCalculations: {
            and: [],
            id: 'uuid',
        },
    },
};

export const expectedChartWithOverrideDashboardFilters: MetricQuery = {
    exploreName: 'test',
    dimensions: ['a_dim1'],
    limit: 501,
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            and: [
                {
                    id: '4',
                    target: {
                        fieldId: 'a_dim1',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['1', '2', '3'],
                },
            ],
            id: 'uuid',
        },
        metrics: {
            and: [],
            id: 'uuid',
        },
        tableCalculations: {
            and: [],
            id: 'uuid',
        },
    },
};

export const expectedChartWithOverrideDashboardORFilters: MetricQuery = {
    exploreName: 'test',
    dimensions: ['a_dim1'],
    limit: 501,
    metrics: [],
    sorts: [],
    tableCalculations: [],
    filters: {
        dimensions: {
            and: [
                {
                    id: 'root',
                    or: [
                        {
                            id: '4',
                            target: {
                                fieldId: 'a_dim1',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['1', '2', '3'],
                        },
                    ],
                },
            ],
            id: 'uuid',
        },
        metrics: {
            and: [],
            id: 'uuid',
        },
        tableCalculations: {
            and: [],
            id: 'uuid',
        },
    },
};
