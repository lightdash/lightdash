import { type AnyType } from './any';

/**
 * Minimal types for the dbt semantic layer (MetricFlow) entries found in
 * dbt manifest v10+ under `semantic_models` and `metrics`. Only the fields
 * Lightdash converts are typed; the manifest contains more.
 */

export type DbtSemanticLayerElementConfig = {
    meta?: {
        group_label?: string;
        hidden?: boolean;
    } & Record<string, AnyType>;
} | null;

export type DbtSemanticModelEntity = {
    name: string;
    type: 'primary' | 'foreign' | 'unique' | 'natural';
    expr?: string | null;
    label?: string | null;
    description?: string | null;
    config?: DbtSemanticLayerElementConfig;
};

export type DbtSemanticModelDimensionGranularity =
    | 'nanosecond'
    | 'microsecond'
    | 'millisecond'
    | 'second'
    | 'minute'
    | 'hour'
    | 'day'
    | 'week'
    | 'month'
    | 'quarter'
    | 'year';

export type DbtSemanticModelDimension = {
    name: string;
    type: 'categorical' | 'time';
    expr?: string | null;
    label?: string | null;
    description?: string | null;
    type_params?: {
        time_granularity?: DbtSemanticModelDimensionGranularity | null;
    } | null;
    config?: DbtSemanticLayerElementConfig;
};

export type DbtSemanticModelMeasureAgg =
    | 'sum'
    | 'min'
    | 'max'
    | 'count_distinct'
    | 'sum_boolean'
    | 'average'
    | 'percentile'
    | 'median'
    | 'count';

export type DbtSemanticModelMeasure = {
    name: string;
    agg: DbtSemanticModelMeasureAgg;
    expr?: string | null;
    label?: string | null;
    description?: string | null;
    create_metric?: boolean;
    agg_params?: {
        percentile?: number | null;
        use_discrete_percentile?: boolean;
    } | null;
    agg_time_dimension?: string | null;
    config?: DbtSemanticLayerElementConfig;
};

export type DbtSemanticModel = {
    unique_id: string;
    name: string;
    label?: string | null;
    description?: string | null;
    model: string; // e.g. "ref('my_model')"
    node_relation?: {
        alias: string;
        schema_name: string;
        database?: string | null;
        relation_name?: string | null;
    } | null;
    defaults?: {
        agg_time_dimension?: string | null;
    } | null;
    entities: DbtSemanticModelEntity[];
    dimensions: DbtSemanticModelDimension[];
    measures: DbtSemanticModelMeasure[];
    depends_on?: {
        nodes?: string[];
    };
    primary_entity?: string | null;
    config?: DbtSemanticLayerElementConfig;
};

export type DbtSemanticLayerMetricInput = {
    name: string;
    filter?: AnyType | null;
    alias?: string | null;
};

export type DbtSemanticLayerMetricType =
    | 'simple'
    | 'ratio'
    | 'cumulative'
    | 'derived'
    | 'conversion';

export type DbtSemanticLayerMetric = {
    unique_id: string;
    name: string;
    label?: string | null;
    description?: string | null;
    type: DbtSemanticLayerMetricType;
    type_params: {
        measure?: DbtSemanticLayerMetricInput | null;
        numerator?: DbtSemanticLayerMetricInput | null;
        denominator?: DbtSemanticLayerMetricInput | null;
    };
    filter?: {
        where_filters: { where_sql_template: string }[];
    } | null;
    config?: DbtSemanticLayerElementConfig;
    depends_on?: {
        nodes?: string[];
    };
};
