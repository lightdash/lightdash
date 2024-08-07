//! Types for dbt GraphQl API, fetched from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#querying

export enum TimeGranularity {
    NANOSECOND = 'NANOSECOND',
    MICROSECOND = 'MICROSECOND',
    MILLISECOND = 'MILLISECOND',
    SECOND = 'SECOND',
    MINUTE = 'MINUTE',
    HOUR = 'HOUR',
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    QUARTER = 'QUARTER',
    YEAR = 'YEAR',
}

export enum DimensionType {
    CATEGORICAL = 'CATEGORICAL',
    TIME = 'TIME',
}

export enum MetricType {
    SIMPLE = 'SIMPLE',
    RATIO = 'RATIO',
    CUMULATIVE = 'CUMULATIVE',
    DERIVED = 'DERIVED',
    CONVERSION = 'CONVERSION',
}

export enum QueryStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPILED = 'COMPILED',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type MetricInput = {
    name: string;
};

export type GroupByInput = {
    name: string;
    grain?: TimeGranularity;
};

export type WhereInput = {
    sql: string;
};

export type OrderByinputBase = {
    descending: boolean;
};

export type OrderByinputMetric = OrderByinputBase & {
    metric: MetricInput;
};

export type OrderByinputGroupBy = OrderByinputBase & {
    groupBy: GroupByInput;
};

export type OrderByInput = OrderByinputMetric | OrderByinputGroupBy;

export type CreateQueryArgs = {
    metrics: MetricInput[];
    groupBy: GroupByInput[];
    limit?: number;
    where: WhereInput[];
    orderBy: OrderByInput[];
};

export type CreateQueryResponse = {
    createQuery: {
        queryId: string;
    };
};

export type CompileSqlArgs = CreateQueryArgs;

export type CompileSqlResponse = {
    compileSql: {
        sql: string;
    };
};

export type RunQueryRawResponse = {
    query: {
        status: QueryStatus;
        sql: string | null;
        jsonResult: string | null; // base64 encoded;
        error: string | null;
    };
};

export type MetricFlowJsonResults = {
    schema: {
        fields: Array<{
            name: string;
            type: string;
        }>;
        primaryKey: Array<string>;
        pandas_version: string;
    };
    data: Array<{
        index: number;
        [key: string]: string | number | boolean | null;
    }>;
};

export type RunQueryResponse = RunQueryRawResponse['query'] & {
    jsonResult: MetricFlowJsonResults | null;
};

type Dimension = {
    name: string;
    description: string;
    type: DimensionType;
    queryableGranularities: TimeGranularity[];
};

type Metric = {
    name: string;
    description: string;
    type: MetricType;
    dimensions: Dimension[];
    queryableGranularities: TimeGranularity[];
};

export type GetMetricsResponse = {
    metrics: Metric[];
};

export type GetMetricsForDimensionsArgs = {
    dimensions: GroupByInput[];
};

export type GetMetricsForDimensionsResponse = {
    metricsForDimensions: Metric[];
};

export type GetDimensionsArgs = {
    metrics: MetricInput[];
};

export type GetDimensionsResponse = {
    dimensions: Dimension[];
};
