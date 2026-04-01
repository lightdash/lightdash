import {
    CompiledMetric,
    Explore,
    FieldType,
    MetricType,
    VizIndexType,
} from '@lightdash/common';
import { EXPLORE, METRIC_QUERY } from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

const METRIC_QUERY_WITH_TOTAL_AND_ROW_TOTAL = {
    ...METRIC_QUERY,
    tableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table1.metric1} / total(${table1.metric1})',
        },
        {
            name: 'pct_row',
            displayName: 'Pct Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table1.metric1} / total(${table1.metric1})',
            compiledSql: '"table1_metric1" / total("table1_metric1")',
            dependsOn: [],
        },
        {
            name: 'pct_row',
            displayName: 'Pct Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
            compiledSql: '"table1_metric1" / row_total("table1_metric1")',
            dependsOn: [],
        },
    ],
};

const TOTALS_PIVOT_CONFIGURATION = {
    indexColumn: [
        {
            reference: 'table1_dim1',
            type: VizIndexType.CATEGORY,
        },
    ],
    valuesColumns: [],
    groupByColumns: undefined,
    sortBy: undefined,
};

const METRIC_QUERY_WITH_TOTAL_DEPENDENT_CALC = {
    ...METRIC_QUERY,
    tableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table1.metric1} / total(${table1.metric1})',
        },
        {
            name: 'double_pct',
            displayName: 'Double Pct',
            sql: '${pct_total} * 2',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table1.metric1} / total(${table1.metric1})',
            compiledSql: '"table1_metric1" / total("table1_metric1")',
            dependsOn: [],
        },
        {
            name: 'double_pct',
            displayName: 'Double Pct',
            sql: '${pct_total} * 2',
            compiledSql: '"pct_total" * 2',
            dependsOn: ['pct_total'],
        },
    ],
};

const METRIC_QUERY_WITH_ROW_TOTAL_NO_PIVOT = {
    ...METRIC_QUERY,
    tableCalculations: [
        {
            name: 'pct_of_row',
            displayName: 'Pct of Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_of_row',
            displayName: 'Pct of Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
            compiledSql: '"table1_metric1" / row_total("table1_metric1")',
            dependsOn: [],
        },
    ],
};

const EXPLORE_WITH_AVG_METRIC: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            metrics: {
                ...EXPLORE.tables.table1.metrics,
                avg_metric: {
                    type: MetricType.AVERAGE,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'avg_metric',
                    label: 'avg_metric',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'AVG("table1".number_column)',
                    tablesReferences: ['table1'],
                    hidden: false,
                } as CompiledMetric,
            },
        },
    },
};

const METRIC_QUERY_WITH_AVG_TOTAL = {
    ...METRIC_QUERY,
    metrics: ['table1_avg_metric'],
    tableCalculations: [
        {
            name: 'pct_of_total',
            displayName: 'Pct of Total',
            sql: '${table1.avg_metric} / total(${table1.avg_metric})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_of_total',
            displayName: 'Pct of Total',
            sql: '${table1.avg_metric} / total(${table1.avg_metric})',
            compiledSql: '"table1_avg_metric" / total("table1_avg_metric")',
            dependsOn: [],
        },
    ],
};

const METRIC_QUERY_WITH_ROW_TOTAL_PIVOT_DIMENSIONS = {
    ...METRIC_QUERY,
    tableCalculations: [
        {
            name: 'pct_of_row',
            displayName: 'Pct of Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_of_row',
            displayName: 'Pct of Row',
            sql: '${table1.metric1} / row_total(${table1.metric1})',
            compiledSql: '"table1_metric1" / row_total("table1_metric1")',
            dependsOn: [],
        },
    ],
};

const EXPLORE_WITH_MIXED_TOTAL_METRICS: Explore = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            metrics: {
                ...EXPLORE.tables.table1.metrics,
                total_revenue: {
                    type: MetricType.SUM,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'total_revenue',
                    label: 'total_revenue',
                    sql: '${TABLE}.revenue',
                    compiledSql: 'SUM("table1".revenue)',
                    tablesReferences: ['table1'],
                    hidden: false,
                } as CompiledMetric,
                avg_order_value: {
                    type: MetricType.AVERAGE,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    tableLabel: 'table1',
                    name: 'avg_order_value',
                    label: 'avg_order_value',
                    sql: '${TABLE}.order_value',
                    compiledSql: 'AVG("table1".order_value)',
                    tablesReferences: ['table1'],
                    hidden: false,
                } as CompiledMetric,
            },
        },
    },
};

const METRIC_QUERY_WITH_MIXED_TOTALS = {
    ...METRIC_QUERY,
    metrics: ['table1_total_revenue', 'table1_avg_order_value'],
    sorts: [{ fieldId: 'table1_total_revenue', descending: true }],
    tableCalculations: [
        {
            name: 'revenue_pct',
            displayName: 'Revenue %',
            sql: '${table1.total_revenue} / total(${table1.total_revenue})',
        },
        {
            name: 'avg_pct',
            displayName: 'Avg %',
            sql: '${table1.avg_order_value} / total(${table1.avg_order_value})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'revenue_pct',
            displayName: 'Revenue %',
            sql: '${table1.total_revenue} / total(${table1.total_revenue})',
            compiledSql:
                '"table1_total_revenue" / total("table1_total_revenue")',
            dependsOn: [],
        },
        {
            name: 'avg_pct',
            displayName: 'Avg %',
            sql: '${table1.avg_order_value} / total(${table1.avg_order_value})',
            compiledSql:
                '"table1_avg_order_value" / total("table1_avg_order_value")',
            dependsOn: [],
        },
    ],
};

const METRIC_QUERY_WITH_FANOUT_TOTAL = {
    exploreName: 'table1',
    dimensions: ['table1_dim1'],
    metrics: ['table2_metric3'],
    filters: {},
    sorts: [{ fieldId: 'table2_metric3', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table2.metric3} / total(${table2.metric3})',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'pct_total',
            displayName: 'Pct Total',
            sql: '${table2.metric3} / total(${table2.metric3})',
            compiledSql: '"table2_metric3" / total("table2_metric3")',
            dependsOn: [],
        },
    ],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

describe('MetricQueryBuilder snapshot: totals queries', () => {
    // Covers totals referenced by dependent table calculations, where total() must be rewritten
    // before downstream calculations materialize their own chained table-calculation CTEs.
    test('matches snapshot for a dependent total-calculation query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TOTAL_DEPENDENT_CALC,
            }),
        ).toMatchSnapshot();
    });

    // Mirrors pivoted table calculations that use both total() and row_total(),
    // protecting column_totals and row_totals rewrites in the same grouped query.
    test('matches snapshot for a pivoted totals query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TOTAL_AND_ROW_TOTAL,
                pivotConfiguration: TOTALS_PIVOT_CONFIGURATION,
            }),
        ).toMatchSnapshot();
    });

    // Covers the no-pivot fallback for row_total(), where the function reduces to the metric itself
    // and the builder should skip generating row_totals and with_totals helper CTEs entirely.
    test('matches snapshot for a row-total query without pivot metadata', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_ROW_TOTAL_NO_PIVOT,
            }),
        ).toMatchSnapshot();
    });

    // Covers total() on an AVG metric, protecting the path that recomputes totals from raw rows
    // with the metric's native aggregation instead of summing already-grouped averages.
    test('matches snapshot for an average-metric total query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_AVG_METRIC,
                compiledMetricQuery: METRIC_QUERY_WITH_AVG_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers mixed total() semantics in one query, where additive metrics can roll up
    // from grouped results while non-additive metrics still re-aggregate from raw rows.
    test('matches snapshot for a mixed additive and non-additive totals query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_MIXED_TOTAL_METRICS,
                compiledMetricQuery: METRIC_QUERY_WITH_MIXED_TOTALS,
            }),
        ).toMatchSnapshot();
    });

    // Covers the fanout-protected total() path, where additive metrics must stay on the raw
    // totals route instead of summing grouped result rows that can repeat across groups.
    test('matches snapshot for a fanout-protected additive total query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_FANOUT_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers the pivotDimensions fallback used without a full pivot configuration,
    // ensuring row_total() still materializes row totals from grouped metric output.
    test('matches snapshot for a row-total query using pivot dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery:
                    METRIC_QUERY_WITH_ROW_TOTAL_PIVOT_DIMENSIONS,
                pivotDimensions: ['table1_dim2'],
            }),
        ).toMatchSnapshot();
    });
});
