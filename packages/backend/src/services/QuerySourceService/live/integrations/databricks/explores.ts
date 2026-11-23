import {
    DimensionType,
    FilterOperator,
    MetricType,
    type ApiSourceMetricAggregation,
} from '@lightdash/common';
import type {
    LiveDimensionDefinition,
    LiveExploreDefinition,
    LiveMetricDefinition,
} from '../../explores/definition';

const NULL_FILTERS = [FilterOperator.NULL, FilterOperator.NOT_NULL];
const STRING_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.INCLUDE,
    FilterOperator.NOT_INCLUDE,
    FilterOperator.STARTS_WITH,
    FilterOperator.ENDS_WITH,
    ...NULL_FILTERS,
];
const NUMBER_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.LESS_THAN,
    FilterOperator.LESS_THAN_OR_EQUAL,
    FilterOperator.GREATER_THAN,
    FilterOperator.GREATER_THAN_OR_EQUAL,
    FilterOperator.IN_BETWEEN,
    ...NULL_FILTERS,
];
export const DATABRICKS_DATE_FILTERS = [
    FilterOperator.EQUALS,
    FilterOperator.NOT_EQUALS,
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.IN_BETWEEN,
    FilterOperator.LESS_THAN,
    FilterOperator.GREATER_THAN,
    ...NULL_FILTERS,
];
const BOOLEAN_FILTERS = [FilterOperator.EQUALS, ...NULL_FILTERS];

export const DATABRICKS_FILTERS_BY_TYPE: Record<
    DimensionType,
    FilterOperator[]
> = {
    [DimensionType.STRING]: STRING_FILTERS,
    [DimensionType.NUMBER]: NUMBER_FILTERS,
    [DimensionType.DATE]: DATABRICKS_DATE_FILTERS,
    [DimensionType.TIMESTAMP]: DATABRICKS_DATE_FILTERS,
    [DimensionType.BOOLEAN]: BOOLEAN_FILTERS,
};

export const DATABRICKS_METRIC_FILTERS = NUMBER_FILTERS.filter(
    (operator) => !NULL_FILTERS.includes(operator),
);

const dimension = ({
    name,
    label,
    description,
    type = DimensionType.STRING,
    column = name,
    sql = `\${TABLE}.${column}`,
}: {
    name: string;
    label: string;
    description: string;
    type?: DimensionType;
    /** The column, or a struct field such as usage_metadata.job_id. */
    column?: string;
    sql?: string;
}): LiveDimensionDefinition => ({
    name,
    apiName: column,
    label,
    description,
    type,
    sql,
    filterOperators: DATABRICKS_FILTERS_BY_TYPE[type],
});

/** A day, week and month of one timestamp column, grouped by Databricks. */
const dateDimensions = (
    prefix: string,
    column: string,
    noun: string,
): LiveDimensionDefinition[] => [
    dimension({
        name: `${prefix}_date`,
        label: `${noun} date`,
        description: `Day of the ${noun.toLowerCase()}, in UTC. Queries without a date filter read the last 30 days.`,
        type: DimensionType.DATE,
        column,
        sql: `CAST(\${TABLE}.${column} AS DATE)`,
    }),
    dimension({
        name: `${prefix}_week`,
        label: `${noun} week`,
        description: 'Weeks start on Monday, in UTC.',
        type: DimensionType.DATE,
        column,
        sql: `CAST(DATE_TRUNC('WEEK', \${TABLE}.${column}) AS DATE)`,
    }),
    dimension({
        name: `${prefix}_month`,
        label: `${noun} month`,
        description: `Month of the ${noun.toLowerCase()}, in UTC.`,
        type: DimensionType.DATE,
        column,
        sql: `CAST(DATE_TRUNC('MONTH', \${TABLE}.${column}) AS DATE)`,
    }),
];

const ADDITIVE: ApiSourceMetricAggregation = { aggregation: 'additive' };
const NON_ADDITIVE: ApiSourceMetricAggregation = {
    aggregation: 'non_additive',
};

const metric = ({
    name,
    label,
    description,
    type,
    sql,
    aggregation,
    format,
}: {
    name: string;
    label: string;
    description: string;
    type: MetricType;
    sql: string;
    aggregation: ApiSourceMetricAggregation;
    format?: string;
}): LiveMetricDefinition => ({
    name,
    apiName: name,
    label,
    description,
    type,
    sql,
    filterOperators: DATABRICKS_METRIC_FILTERS,
    aggregation,
    ...(format ? { format } : {}),
});

/**
 * Billable usage priced at the list price in effect when it ended, as in
 * Databricks' own cost queries. List prices are in USD.
 */
const BILLING_USAGE_SQL = `SELECT usage.*, usage.usage_quantity * CAST(list_prices.pricing.default AS DOUBLE) AS list_cost
FROM system.billing.usage AS usage
LEFT JOIN system.billing.list_prices AS list_prices
  ON list_prices.sku_name = usage.sku_name
  AND usage.usage_end_time >= list_prices.price_start_time
  AND (list_prices.price_end_time IS NULL OR usage.usage_end_time < list_prices.price_end_time)`;

const FAILED_RUN_STATES = "('FAILED', 'ERROR', 'TIMED_OUT')";

/** A system table explore and the SQL its table name stands for. */
export type DatabricksExploreDefinition = LiveExploreDefinition & {
    tableSql: string;
};

export const DATABRICKS_BILLING_USAGE_EXPLORE: DatabricksExploreDefinition = {
    name: 'billing_usage',
    label: 'Billable usage',
    description:
        'Billable usage of the Databricks account from system.billing.usage, priced at list price. Records arrive within hours; dates are UTC.',
    tableSql: BILLING_USAGE_SQL,
    dimensions: [
        ...dateDimensions('usage', 'usage_date', 'Usage'),
        dimension({
            name: 'workspace_id',
            label: 'Workspace ID',
            description: 'The workspace the usage belongs to.',
        }),
        dimension({
            name: 'sku_name',
            label: 'SKU',
            description: 'The SKU billed, such as PREMIUM_JOBS_COMPUTE.',
        }),
        dimension({
            name: 'billing_origin_product',
            label: 'Product',
            description:
                'The product that ran up the usage, such as JOBS, SQL, DLT, MODEL_SERVING or INTERACTIVE.',
        }),
        dimension({
            name: 'usage_unit',
            label: 'Usage unit',
            description: 'The unit of the usage quantity, usually DBU.',
        }),
        dimension({
            name: 'cloud',
            label: 'Cloud',
            description: 'AWS, AZURE or GCP.',
        }),
        dimension({
            name: 'record_type',
            label: 'Record type',
            description:
                'ORIGINAL, or RETRACTION and RESTATEMENT for corrections.',
        }),
        dimension({
            name: 'is_serverless',
            label: 'Serverless',
            description: 'Whether the usage ran on serverless compute.',
            type: DimensionType.BOOLEAN,
            column: 'product_features.is_serverless',
        }),
        dimension({
            name: 'job_id',
            label: 'Job ID',
            description: 'The job behind the usage, for job compute.',
            column: 'usage_metadata.job_id',
        }),
        dimension({
            name: 'warehouse_id',
            label: 'SQL warehouse ID',
            description: 'The SQL warehouse behind the usage.',
            column: 'usage_metadata.warehouse_id',
        }),
        dimension({
            name: 'cluster_id',
            label: 'Cluster ID',
            description: 'The cluster behind the usage, for classic compute.',
            column: 'usage_metadata.cluster_id',
        }),
        dimension({
            name: 'run_as',
            label: 'Run as',
            description:
                'The user or service principal the workload ran as, where Databricks records it.',
            column: 'identity_metadata.run_as',
        }),
    ],
    metrics: [
        metric({
            name: 'usage_quantity',
            label: 'Usage quantity',
            description:
                'Units used, usually DBUs; group by usage unit before adding units of different kinds.',
            type: MetricType.SUM,
            sql: '${TABLE}.usage_quantity',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'list_cost',
            label: 'List cost (USD)',
            description:
                'Usage times the list price in effect at the time; discounts and commitments are not applied.',
            type: MetricType.SUM,
            sql: '${TABLE}.list_cost',
            aggregation: ADDITIVE,
            format: 'usd',
        }),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'usage_date', defaultDays: 30 },
    incompatible: [],
};

export const DATABRICKS_QUERY_HISTORY_EXPLORE: DatabricksExploreDefinition = {
    name: 'query_history',
    label: 'Query history',
    description:
        'Statements run on SQL warehouses and serverless compute, from system.query.history. Rows arrive within about an hour; dates are UTC.',
    tableSql: 'SELECT * FROM system.query.history',
    dimensions: [
        ...dateDimensions('start', 'start_time', 'Start'),
        dimension({
            name: 'workspace_id',
            label: 'Workspace ID',
            description: 'The workspace the statement ran in.',
        }),
        dimension({
            name: 'warehouse_id',
            label: 'SQL warehouse ID',
            description: 'The SQL warehouse the statement ran on.',
            column: 'compute.warehouse_id',
        }),
        dimension({
            name: 'executed_by',
            label: 'Executed by',
            description: 'The user or service principal that ran it.',
        }),
        dimension({
            name: 'execution_status',
            label: 'Execution status',
            description: 'FINISHED, FAILED or CANCELED.',
        }),
        dimension({
            name: 'statement_type',
            label: 'Statement type',
            description: 'SELECT, INSERT, MERGE and so on.',
        }),
        dimension({
            name: 'client_application',
            label: 'Client application',
            description:
                'The tool that sent it, such as Databricks SQL Editor, a BI tool or dbt.',
        }),
        dimension({
            name: 'statement_id',
            label: 'Statement ID',
            description: 'One statement run.',
        }),
        dimension({
            name: 'error_message',
            label: 'Error message',
            description: 'Why a failed statement failed.',
        }),
    ],
    metrics: [
        metric({
            name: 'query_count',
            label: 'Queries',
            description: 'Statements run.',
            type: MetricType.COUNT,
            sql: '${TABLE}.statement_id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'failed_queries',
            label: 'Failed queries',
            description: 'Statements that failed.',
            type: MetricType.COUNT,
            sql: "CASE WHEN ${TABLE}.execution_status = 'FAILED' THEN ${TABLE}.statement_id END",
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'total_duration_ms',
            label: 'Total duration (ms)',
            description:
                'Wall-clock time of all statements, queueing included.',
            type: MetricType.SUM,
            sql: '${TABLE}.total_duration_ms',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'avg_duration_ms',
            label: 'Average duration (ms)',
            description: 'Average wall-clock time per statement.',
            type: MetricType.AVERAGE,
            sql: '${TABLE}.total_duration_ms',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'p95_duration_ms',
            label: 'p95 duration (ms)',
            description: 'Approximate 95th percentile of wall-clock time.',
            type: MetricType.NUMBER,
            sql: 'PERCENTILE_APPROX(${TABLE}.total_duration_ms, 0.95)',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'avg_waiting_for_compute_ms',
            label: 'Average wait for compute (ms)',
            description: 'Average time waiting for compute to start.',
            type: MetricType.AVERAGE,
            sql: '${TABLE}.waiting_for_compute_duration_ms',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'avg_waiting_at_capacity_ms',
            label: 'Average wait at capacity (ms)',
            description:
                'Average time queued because the warehouse was at capacity.',
            type: MetricType.AVERAGE,
            sql: '${TABLE}.waiting_at_capacity_duration_ms',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'read_bytes',
            label: 'Bytes read',
            description: 'Data read by the statements.',
            type: MetricType.SUM,
            sql: '${TABLE}.read_bytes',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'read_rows',
            label: 'Rows read',
            description: 'Rows read by the statements.',
            type: MetricType.SUM,
            sql: '${TABLE}.read_rows',
            aggregation: ADDITIVE,
        }),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'start_date', defaultDays: 30 },
    incompatible: [],
};

export const DATABRICKS_JOB_RUNS_EXPLORE: DatabricksExploreDefinition = {
    name: 'job_runs',
    label: 'Job runs',
    description:
        'Job runs from system.lakeflow.job_run_timeline. Long runs are split into hourly slices; the result state is on the last one. Dates are UTC.',
    tableSql: 'SELECT * FROM system.lakeflow.job_run_timeline',
    dimensions: [
        ...dateDimensions('run', 'period_start_time', 'Run'),
        dimension({
            name: 'workspace_id',
            label: 'Workspace ID',
            description: 'The workspace the job runs in.',
        }),
        dimension({
            name: 'job_id',
            label: 'Job ID',
            description: 'The job.',
        }),
        dimension({
            name: 'run_id',
            label: 'Run ID',
            description: 'One run of a job.',
        }),
        dimension({
            name: 'result_state',
            label: 'Result state',
            description:
                'SUCCEEDED, FAILED, ERROR, TIMED_OUT, CANCELLED or SKIPPED; empty while the run goes on.',
        }),
        dimension({
            name: 'trigger_type',
            label: 'Trigger type',
            description: 'What started the run, such as CRON or ONETIME.',
        }),
        dimension({
            name: 'run_type',
            label: 'Run type',
            description: 'JOB_RUN, SUBMIT_RUN or WORKFLOW_RUN.',
        }),
    ],
    metrics: [
        metric({
            name: 'run_count',
            label: 'Runs',
            description: 'Distinct runs.',
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.run_id',
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'failed_runs',
            label: 'Failed runs',
            description: 'Runs that ended FAILED, ERROR or TIMED_OUT.',
            type: MetricType.COUNT_DISTINCT,
            sql: `CASE WHEN \${TABLE}.result_state IN ${FAILED_RUN_STATES} THEN \${TABLE}.run_id END`,
            aggregation: NON_ADDITIVE,
        }),
        metric({
            name: 'run_seconds',
            label: 'Run time (s)',
            description: 'Time the runs took, summed over their slices.',
            type: MetricType.SUM,
            sql: 'TIMESTAMPDIFF(SECOND, ${TABLE}.period_start_time, ${TABLE}.period_end_time)',
            aggregation: ADDITIVE,
        }),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'run_date', defaultDays: 30 },
    incompatible: [],
};

export const DATABRICKS_AUDIT_EVENTS_EXPLORE: DatabricksExploreDefinition = {
    name: 'audit_events',
    label: 'Audit events',
    description:
        'Workspace and account actions from system.access.audit. Dates are UTC.',
    tableSql: 'SELECT * FROM system.access.audit',
    dimensions: [
        ...dateDimensions('event', 'event_time', 'Event'),
        dimension({
            name: 'workspace_id',
            label: 'Workspace ID',
            description: 'The workspace, or 0 for account-level events.',
        }),
        dimension({
            name: 'service_name',
            label: 'Service',
            description: 'The service acted on, such as unityCatalog or jobs.',
        }),
        dimension({
            name: 'action_name',
            label: 'Action',
            description: 'What was done, such as getTable or runCommand.',
        }),
        dimension({
            name: 'user_email',
            label: 'User',
            description: 'Who did it.',
            column: 'user_identity.email',
        }),
        dimension({
            name: 'status_code',
            label: 'Status code',
            description: 'The HTTP status of the response; 403 is denied.',
            type: DimensionType.NUMBER,
            column: 'response.status_code',
        }),
        dimension({
            name: 'source_ip_address',
            label: 'Source IP',
            description: 'Where the request came from.',
        }),
    ],
    metrics: [
        metric({
            name: 'event_count',
            label: 'Events',
            description: 'Audit events.',
            type: MetricType.COUNT,
            sql: '${TABLE}.event_id',
            aggregation: ADDITIVE,
        }),
        metric({
            name: 'distinct_users',
            label: 'Distinct users',
            description: 'Distinct users acting.',
            type: MetricType.COUNT_DISTINCT,
            sql: '${TABLE}.user_identity.email',
            aggregation: NON_ADDITIVE,
        }),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: { dimension: 'event_date', defaultDays: 30 },
    incompatible: [],
};

export const DATABRICKS_TABLES_EXPLORE: DatabricksExploreDefinition = {
    name: 'tables',
    label: 'Tables',
    description:
        'Every table and view in the Unity Catalog metastore the credential can see, from system.information_schema.tables.',
    tableSql: 'SELECT * FROM system.information_schema.tables',
    dimensions: [
        dimension({
            name: 'table_catalog',
            label: 'Catalog',
            description: 'The catalog holding the table.',
        }),
        dimension({
            name: 'table_schema',
            label: 'Schema',
            description: 'The schema holding the table.',
        }),
        dimension({
            name: 'table_name',
            label: 'Table',
            description: 'The table name.',
        }),
        dimension({
            name: 'table_type',
            label: 'Table type',
            description:
                'MANAGED, EXTERNAL, VIEW, MATERIALIZED_VIEW and so on.',
        }),
        dimension({
            name: 'data_source_format',
            label: 'Format',
            description: 'DELTA, PARQUET, CSV and so on.',
        }),
        dimension({
            name: 'table_owner',
            label: 'Owner',
            description: 'The user or group owning the table.',
        }),
        dimension({
            name: 'created',
            label: 'Created',
            description: 'When the table was created.',
            type: DimensionType.TIMESTAMP,
        }),
        dimension({
            name: 'last_altered',
            label: 'Last altered',
            description: 'When the table last changed.',
            type: DimensionType.TIMESTAMP,
        }),
    ],
    metrics: [
        metric({
            name: 'table_count',
            label: 'Tables',
            description: 'Tables and views.',
            type: MetricType.COUNT,
            sql: '${TABLE}.table_name',
            aggregation: ADDITIVE,
        }),
    ],
    maxDimensions: null,
    maxMetrics: null,
    dateRange: null,
    incompatible: [],
};

export const DATABRICKS_EXPLORES = [
    DATABRICKS_BILLING_USAGE_EXPLORE,
    DATABRICKS_QUERY_HISTORY_EXPLORE,
    DATABRICKS_JOB_RUNS_EXPLORE,
    DATABRICKS_AUDIT_EVENTS_EXPLORE,
    DATABRICKS_TABLES_EXPLORE,
] as const satisfies readonly DatabricksExploreDefinition[];

/** The SQL a system table explore's table name stands for, by explore name. */
export const getDatabricksTableSql = (definitionName: string): string => {
    const explore = DATABRICKS_EXPLORES.find(
        ({ name }) => name === definitionName,
    );
    if (!explore) {
        throw new Error(`No Databricks explore named ${definitionName}`);
    }
    return explore.tableSql;
};
