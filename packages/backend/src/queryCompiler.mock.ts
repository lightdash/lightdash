import {
    CompiledMetricQuery,
    Explore,
    MetricQuery,
    SupportedDbtAdapter,
} from 'common';

export const EXPLORE: Pick<Explore, 'targetDatabase'> = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
};

export const METRIC_QUERY_NO_CALCS: MetricQuery = {
    dimensions: ['table1_dim_1', 'table_2_dim_2'],
    metrics: ['table_3_metric_1', 'table55_metric__23_1'],
    filters: [],
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

export const METRIC_QUERY_VALID_REFERENCES: MetricQuery = {
    ...METRIC_QUERY_NO_CALCS,
    tableCalculations: [
        { name: 'calc1', displayName: '', sql: 'no references ${nope ' },
        {
            name: 'calc2',
            displayName: '',
            sql: 'dim reference ${table1.dim_1}',
        },
        {
            name: 'calc3',
            displayName: '',
            sql: 'metric reference ${table_3.metric_1}',
        },
    ],
};

export const METRIC_QUERY_VALID_REFERENCES_COMPILED: CompiledMetricQuery = {
    ...METRIC_QUERY_VALID_REFERENCES,
    compiledTableCalculations: [
        {
            name: 'calc1',
            displayName: '',
            sql: 'no references ${nope ',
            compiledSql: 'no references ${nope ',
        },
        {
            name: 'calc2',
            displayName: '',
            sql: 'dim reference ${table1.dim_1}',
            compiledSql: 'dim reference "table1_dim_1"',
        },
        {
            name: 'calc3',
            displayName: '',
            sql: 'metric reference ${table_3.metric_1}',
            compiledSql: 'metric reference "table_3_metric_1"',
        },
    ],
};

export const METRIC_QUERY_MISSING_REFERENCE: MetricQuery = {
    ...METRIC_QUERY_NO_CALCS,
    tableCalculations: [
        { name: 'calc1', displayName: '', sql: '${notexists.nah}' },
    ],
};

export const METRIC_QUERY_INVALID_REFERENCE_FORMAT: MetricQuery = {
    ...METRIC_QUERY_NO_CALCS,
    tableCalculations: [{ name: 'calc1', displayName: '', sql: '${nodot}' }],
};

export const METRIC_QUERY_DUPLICATE_NAME: MetricQuery = {
    ...METRIC_QUERY_NO_CALCS,
    tableCalculations: [
        { name: 'table_3_metric_1', displayName: '', sql: '${table1.dim_1}' },
    ],
};
