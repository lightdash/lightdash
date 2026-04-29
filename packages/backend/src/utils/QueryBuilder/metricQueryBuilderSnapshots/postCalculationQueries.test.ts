import {
    DimensionType,
    Explore,
    FieldType,
    MetricType,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { EXPLORE, METRIC_QUERY } from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

const EXPLORE_WITH_PERCENT_OF_TOTAL_METRIC: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            metrics: {
                ...EXPLORE.tables.table1.metrics,
                percent_of_total_metric: {
                    type: MetricType.PERCENT_OF_TOTAL,
                    fieldType: FieldType.METRIC as const,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'percent_of_total_metric',
                    label: 'Percent of Total',
                    sql: '${table1.metric1}',
                    compiledSql: '...',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
        },
    },
};

const METRIC_QUERY_WITH_PERCENT_OF_TOTAL = {
    ...METRIC_QUERY,
    metrics: ['table1_metric1', 'table1_percent_of_total_metric'],
    tableCalculations: [],
    compiledTableCalculations: [],
};

const EXPLORE_WITH_RUNNING_TOTAL_AND_DIMENSIONS: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            dimensions: {
                ...EXPLORE.tables.table1.dimensions,
                category: {
                    type: DimensionType.STRING,
                    name: 'category',
                    label: 'Category',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION as const,
                    sql: '${TABLE}.category',
                    compiledSql: '"table1".category',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
            metrics: {
                ...EXPLORE.tables.table1.metrics,
                running_total_metric: {
                    type: MetricType.RUNNING_TOTAL,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'running_total_metric',
                    label: 'Running Total',
                    sql: '${table1.metric1}',
                    compiledSql: '...',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
        },
    },
};

const EXPLORE_WITH_PERCENT_OF_TOTAL_AND_PIVOT_DIMENSION: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            dimensions: {
                ...EXPLORE.tables.table1.dimensions,
                category: {
                    type: DimensionType.STRING,
                    name: 'category',
                    label: 'Category',
                    table: 'table1',
                    tableLabel: 'table1',
                    fieldType: FieldType.DIMENSION as const,
                    sql: '${TABLE}.category',
                    compiledSql: '"table1".category',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
            metrics: {
                ...EXPLORE.tables.table1.metrics,
                percent_of_total_metric: {
                    type: MetricType.PERCENT_OF_TOTAL,
                    fieldType: FieldType.METRIC as const,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'percent_of_total_metric',
                    label: 'Percent of Total',
                    sql: '${table1.metric1}',
                    compiledSql: '...',
                    tablesReferences: ['table1'],
                    hidden: false,
                },
            },
        },
    },
};

const METRIC_QUERY_WITH_PERCENT_OF_TOTAL_PIVOT = {
    ...METRIC_QUERY,
    dimensions: ['table1_dim1', 'table1_category'],
    metrics: ['table1_percent_of_total_metric'],
    tableCalculations: [],
    compiledTableCalculations: [],
};

const PERCENT_OF_TOTAL_PIVOT_CONFIGURATION = {
    indexColumn: [
        {
            reference: 'table1_dim1',
            type: VizIndexType.CATEGORY,
        },
    ],
    valuesColumns: [
        {
            reference: 'table1_percent_of_total_metric',
            aggregation: VizAggregationOptions.ANY,
        },
    ],
    groupByColumns: [{ reference: 'table1_category' }],
    sortBy: [
        {
            reference: 'table1_dim1',
            direction: SortByDirection.ASC,
        },
    ],
};

const METRIC_QUERY_WITH_RUNNING_TOTAL_PIVOT = {
    ...METRIC_QUERY,
    dimensions: ['table1_dim1', 'table1_category'],
    metrics: ['table1_running_total_metric'],
    tableCalculations: [],
    compiledTableCalculations: [],
};

const RUNNING_TOTAL_PIVOT_CONFIGURATION = {
    indexColumn: [
        {
            reference: 'table1_dim1',
            type: VizIndexType.CATEGORY,
        },
    ],
    valuesColumns: [
        {
            reference: 'table1_running_total_metric',
            aggregation: VizAggregationOptions.ANY,
        },
    ],
    groupByColumns: [{ reference: 'table1_category' }],
    sortBy: [
        {
            reference: 'table1_dim1',
            direction: SortByDirection.ASC,
        },
    ],
};

describe('MetricQueryBuilder snapshot: post-calculation queries', () => {
    // Covers post-calculation metrics that run after the grouped metrics CTE,
    // using a window aggregate over grouped results to compute percent-of-total safely.
    test('matches snapshot for a percent-of-total post-calculation query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_PERCENT_OF_TOTAL_METRIC,
                compiledMetricQuery: METRIC_QUERY_WITH_PERCENT_OF_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers running-total metrics with pivot grouping, where the post-calculation window
    // must partition by non-index pivot dimensions while preserving grouped metric output.
    test('matches snapshot for a running-total post-calculation query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_RUNNING_TOTAL_AND_DIMENSIONS,
                compiledMetricQuery: METRIC_QUERY_WITH_RUNNING_TOTAL_PIVOT,
                pivotConfiguration: RUNNING_TOTAL_PIVOT_CONFIGURATION,
            }),
        ).toMatchSnapshot();
    });

    // Pivoted percent_of_total: must partition by indexColumn (row dim) so each
    // row sums to 100% across pivot columns (Looker semantics).
    test('matches snapshot for a percent-of-total post-calculation query with pivot', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_PERCENT_OF_TOTAL_AND_PIVOT_DIMENSION,
                compiledMetricQuery: METRIC_QUERY_WITH_PERCENT_OF_TOTAL_PIVOT,
                pivotConfiguration: PERCENT_OF_TOTAL_PIVOT_CONFIGURATION,
            }),
        ).toMatchSnapshot();
    });

    // Fallback path when SQL pivot feature flag is off: only `pivotDimensions`
    // is supplied. Should still partition percent_of_total by the non-pivot
    // dimensions (derived from the dimensions list minus pivotDimensions).
    test('matches snapshot for a percent-of-total post-calculation query with pivotDimensions only', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_PERCENT_OF_TOTAL_AND_PIVOT_DIMENSION,
                compiledMetricQuery: METRIC_QUERY_WITH_PERCENT_OF_TOTAL_PIVOT,
                pivotDimensions: ['table1_category'],
            }),
        ).toMatchSnapshot();
    });
});
