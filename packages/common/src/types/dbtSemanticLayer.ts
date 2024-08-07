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

export type RunQueryResponse = {
    // TODO: type the response properties
    status: any;
    sql: string;
    jsonResult: any;
    error: any;
};
