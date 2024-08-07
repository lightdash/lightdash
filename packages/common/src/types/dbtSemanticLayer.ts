//! Types for dbt GraphQl API, fetched from: https://docs.getdbt.com/docs/dbt-cloud-apis/sl-graphql#querying

export type MetricInput = {
    name: string;
};

export type GroupByInput = {
    name: string;
    // grain: TimeGranularity = null; // TODO: Revisit when implementing time granularity
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
    order: OrderByInput[];
};

export type CreateQueryResponse = {
    queryId: string;
};

export type CompileSqlArgs = CreateQueryArgs;

export type CompileSqlResponse = {
    sql: string;
};

export enum QueryStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPILED = 'COMPILED',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type RunQueryRawResponse = {
    status: QueryStatus;
    sql: string | null;
    jsonResult: string | null; // base64 encoded;
    error: string | null;
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

export type RunQueryResponse = RunQueryRawResponse & {
    jsonResult: MetricFlowJsonResults | null;
};
