import { type AnyType } from './any';

/**
 * Types for dbt's MetricFlow semantic layer as it appears in the dbt manifest
 * (`semantic_models` + `metrics`). These are the definitions dbt Core writes
 * when a project uses semantic models — no dbt Cloud required.
 *
 * Translation into Lightdash metrics lives in `dbt/metricFlow.ts`.
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

export type DbtSemanticMeasure = {
    name: string;
    agg: MetricFlowAggregation;
    description?: string | null;
    label?: string | null;
    create_metric?: boolean;
    expr?: string | null;
    agg_params?: DbtSemanticMeasureAggParams | null;
    agg_time_dimension?: string | null;
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

export type DbtSemanticMetricInputMeasure = {
    name: string;
    filter?: AnyType | null;
    alias?: string | null;
};

/**
 * dbt Fusion / latest-spec manifests inline the aggregation on simple metrics
 * (`type_params.measure` is null) instead of referencing a measure.
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
    numerator?: AnyType | null;
    denominator?: AnyType | null;
    expr?: string | null;
    metrics?: AnyType[] | null;
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
    filter?: AnyType | null;
    depends_on?: { nodes?: string[] };
};
