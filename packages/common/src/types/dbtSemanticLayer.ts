import { type AnyType } from './any';

/**
 * Types for dbt's MetricFlow semantic layer as it appears in the dbt manifest
 * (`semantic_models` + `metrics`). Translation: `dbt/metricFlow.ts`.
 */

/** MetricFlow measure aggregation types (dbt manifest `Measure.agg`). */
export enum MetricFlowAggregation {
    SUM = 'sum',
    MIN = 'min',
    MAX = 'max',
    COUNT_DISTINCT = 'count_distinct',
    SUM_BOOLEAN = 'sum_boolean',
    AVERAGE = 'average',
    PERCENTILE = 'percentile',
    MEDIAN = 'median',
    COUNT = 'count',
}

export type DbtSemanticMeasureAggParams = {
    percentile: number | null;
    use_discrete_percentile?: boolean;
    use_approximate_percentile?: boolean;
};

/**
 * Component-level `config.meta` in a MetricFlow manifest. dbt Core and Fusion
 * both nest arbitrary user metadata under `config.meta` on measures, metrics
 * and dimensions. Only the keys Lightdash understands are typed; any other
 * keys (e.g. a third-party `hex:` block) are ignored during translation.
 */
export type DbtSemanticConfig = {
    meta?: {
        hidden?: boolean | null;
        group_label?: string | null;
        format?: string | null;
    } | null;
};

export type DbtSemanticMeasure = {
    name: string;
    agg: MetricFlowAggregation;
    description?: string | null;
    label?: string | null;
    create_metric?: boolean;
    expr?: string | null;
    agg_params?: DbtSemanticMeasureAggParams | null;
    agg_time_dimension?: string | null;
    config?: DbtSemanticConfig | null;
};

export type DbtSemanticEntity = {
    name: string;
    type: 'foreign' | 'natural' | 'primary' | 'unique';
    expr?: string | null;
};

export type DbtSemanticDimension = {
    name: string;
    type: 'categorical' | 'time';
    expr?: string | null;
    config?: DbtSemanticConfig | null;
};

export type DbtSemanticModel = {
    name: string;
    unique_id: string;
    /** dbt ref string for the underlying model, e.g. "ref('orders')". */
    model: string;
    node_relation: {
        alias: string;
        schema_name: string;
        database?: string | null;
        relation_name?: string | null;
    } | null;
    description?: string | null;
    label?: string | null;
    entities?: DbtSemanticEntity[];
    measures?: DbtSemanticMeasure[];
    dimensions?: DbtSemanticDimension[];
    depends_on?: { nodes?: string[] };
};

/** A single rendered-SQL where filter (dbt manifest `WhereFilter`). */
export type DbtSemanticWhereFilter = {
    where_sql_template?: string | null;
};

/**
 * Metric/measure `filter:` as it appears in the manifest. dbt Core and Fusion
 * both normalise the YAML string into `{ where_filters: [...] }`.
 */
export type DbtSemanticFilter =
    | string
    | { where_filters?: DbtSemanticWhereFilter[] | null }
    | null;

export type DbtSemanticMetricInputMeasure = {
    name: string;
    filter?: DbtSemanticFilter;
    alias?: string | null;
};

/**
 * Reference to another metric used as an input to a ratio/derived metric
 * (dbt manifest `MetricInput`).
 */
export type DbtSemanticMetricInput = {
    name: string;
    filter?: DbtSemanticFilter;
    alias?: string | null;
    offset_window?: AnyType | null;
    offset_to_grain?: string | null;
};

/**
 * Latest-spec simple metrics inline aggregation here (`type_params.measure` is
 * null). Core 1.12 omits `expr` (column is on `type_params.expr`); Fusion sets both.
 */
export type DbtSemanticMetricAggregationParams = {
    semantic_model: string;
    agg: MetricFlowAggregation;
    agg_params?: DbtSemanticMeasureAggParams | null;
    expr?: string | null;
    agg_time_dimension?: string | null;
};

export type DbtSemanticMetricTypeParams = {
    measure?: DbtSemanticMetricInputMeasure | null;
    numerator?: DbtSemanticMetricInput | null;
    denominator?: DbtSemanticMetricInput | null;
    expr?: string | null;
    metrics?: DbtSemanticMetricInput[] | null;
    metric_aggregation_params?: DbtSemanticMetricAggregationParams | null;
};

export type DbtSemanticMetricType =
    | 'simple'
    | 'ratio'
    | 'cumulative'
    | 'derived'
    | 'conversion';

export type DbtSemanticMetric = {
    name: string;
    unique_id: string;
    type: DbtSemanticMetricType;
    type_params: DbtSemanticMetricTypeParams;
    label?: string | null;
    description?: string | null;
    filter?: DbtSemanticFilter;
    config?: DbtSemanticConfig | null;
    depends_on?: { nodes?: string[] };
};
