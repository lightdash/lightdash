//! Types for dbt GraphQl API, fetched from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#querying

export enum DbtTimeGranularity {
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

export enum DbtDimensionType {
    CATEGORICAL = 'CATEGORICAL',
    TIME = 'TIME',
}

export enum DbtMetricType {
    SIMPLE = 'SIMPLE',
    RATIO = 'RATIO',
    CUMULATIVE = 'CUMULATIVE',
    DERIVED = 'DERIVED',
    CONVERSION = 'CONVERSION',
}

export enum DbtQueryStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPILED = 'COMPILED',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

// TODO: add more operators, there is probably reusable code in our semantic layer
export enum DbtWhereOperator {
    IN = 'IN',
    NOT_IN = 'NOT IN',
    EQUALS = '=',
    NOT_EQUALS = '!=',
}

export type DbtGraphQLMetricInput = {
    name: string;
};

export type DbtGraphQLGroupByInput = {
    name: string;
    grain?: DbtTimeGranularity;
};

export type DbtGraphQLWhereInput = {
    sql: string;
};

export type DbtGraphQLOrderByinputBase = {
    descending: boolean;
};

export type DbtGraphQLOrderByinputMetric = DbtGraphQLOrderByinputBase & {
    metric: DbtGraphQLMetricInput;
};

export type DbtGraphQLOrderByinputGroupBy = DbtGraphQLOrderByinputBase & {
    groupBy: DbtGraphQLGroupByInput;
};

export type DbtGraphQLOrderByInput =
    | DbtGraphQLOrderByinputMetric
    | DbtGraphQLOrderByinputGroupBy;

export type DbtGraphQLCreateQueryArgs = {
    metrics: DbtGraphQLMetricInput[];
    groupBy: DbtGraphQLGroupByInput[];
    limit?: number;
    where: DbtGraphQLWhereInput[];
    orderBy: DbtGraphQLOrderByInput[];
};

export type DbtGraphQLCreateQueryResponse = {
    createQuery: {
        queryId: string;
    };
};

export type DbtGraphQLCompileSqlArgs = DbtGraphQLCreateQueryArgs;

export type DbtGraphQLCompileSqlResponse = {
    compileSql: {
        sql: string;
    };
};

export type DbtGraphQLRunQueryRawResponse = {
    query: {
        status: DbtQueryStatus;
        sql: string | null;
        jsonResult: string | null; // base64 encoded;
        error: string | null;
        totalPages: number | null;
    };
};

export type DbtGraphQLJsonResult = {
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

export type DbtGraphQLRunQueryResponse =
    DbtGraphQLRunQueryRawResponse['query'] & {
        jsonResult: DbtGraphQLJsonResult | null;
    };

export type DbtGraphQLDimension = {
    name: string;
    description: string | null;
    label: string | null;
    type: DbtDimensionType;
    queryableGranularities: DbtTimeGranularity[];
};

export type DbtGraphQLMetric = {
    name: string;
    description: string | null;
    label: string | null;
    type: DbtMetricType;
    dimensions: DbtGraphQLDimension[];
    queryableGranularities: DbtTimeGranularity[];
};

export type DbtGraphQLGetMetricsResponse = {
    metrics: DbtGraphQLMetric[];
};

export type DbtGraphQLGetMetricsForDimensionsArgs = {
    dimensions: DbtGraphQLGroupByInput[];
};

export type DbtGraphQLGetMetricsForDimensionsResponse = {
    metricsForDimensions: DbtGraphQLMetric[];
};

export type DbtGraphQLGetDimensionsArgs = {
    metrics: DbtGraphQLMetricInput[];
};

export type DbtGraphQLGetDimensionsResponse = {
    dimensions: DbtGraphQLDimension[];
};
