import { lightdashApi } from '../api';

export enum MetricFlowDimensionType {
    CATEGORICAL = 'CATEGORICAL',
    TIME = 'TIME',
}

export enum MetricFlowMetricType {
    SIMPLE = 'SIMPLE',
    RATIO = 'RATIO',
    DERIVED = 'DERIVED',
    CUMULATIVE = 'CUMULATIVE',
}

export type GetMetricFlowFieldsResponse = {
    dimensions: Array<{
        name: string;
        description?: string;
        type: MetricFlowDimensionType;
    }>;
    metricsForDimensions: Array<{
        name: string;
        description?: string;
        type: MetricFlowMetricType;
        dimensions: Array<{
            name: string;
            description?: string;
            type: MetricFlowDimensionType;
        }>;
    }>;
};

export function getMetricFlowFields(
    projectUuid: string,
    selectedFields?: {
        metrics: string[];
        dimensions: string[];
    },
): Promise<GetMetricFlowFieldsResponse> {
    const query = `query GetFields($environmentId: BigInt!) {
            metricsForDimensions(environmentId: $environmentId, dimensions: [${
                selectedFields?.dimensions
                    .filter((dimension) => dimension !== 'metric_time') // TODO: remove this when dbt stops throwing error when filtering by "metric_time"
                    .map((dimension) => `{ name: "${dimension}" }`) ?? ''
            }]) {
                name
                description
                type
                dimensions {
                  name
                  description
                  type
                } 
            }
            dimensions(environmentId: $environmentId, metrics: [${
                selectedFields?.metrics.map(
                    (metric) => `{ name: "${metric}" }`,
                ) ?? ''
            }]) {
                name
                description
                type
            }
        }`;

    return lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'GetFields' }),
    });
}

export type CreateMetricFlowQueryResponse = {
    createQuery: {
        queryId: string;
    };
};

export function createMetricFlowQuery(
    projectUuid: string,
    data: {
        metrics: string[];
        dimensions: string[];
    },
): Promise<CreateMetricFlowQueryResponse> {
    const query: string = `
            mutation CreateQuery($environmentId: BigInt!) {
              createQuery(
                environmentId: $environmentId
                metrics: [${data.metrics.map(
                    (metric) => `{ name: "${metric}" }`,
                )}]
                groupBy: [${data.dimensions.map(
                    (dimension) => `{ name: "${dimension}" }`,
                )}]
              ) {
                queryId
              }
            }`;

    return lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'CreateQuery' }),
    });
}

export enum QueryStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    COMPILED = 'COMPILED',
    SUCCESSFUL = 'SUCCESSFUL',
    FAILED = 'FAILED',
}

export type GetMetricFlowQueryBase64ResultsResponse = {
    query: {
        status: QueryStatus;
        sql: string;
        jsonResult: string; // base64 encoded
        error: string;
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

export type GetMetricFlowQueryResultsResponse = {
    query: {
        status: QueryStatus;
        sql: string | null;
        jsonResult: MetricFlowJsonResults | null;
        error: string | null;
    };
};

export function getMetricFlowQueryResults(
    projectUuid: string,
    queryId: string,
): Promise<GetMetricFlowQueryResultsResponse> {
    const query: string = `query GetQueryResults($environmentId: BigInt!) {
              query(environmentId: $environmentId, queryId: "${queryId}") {
                status
                sql
                jsonResult
                error
              }
            }`;

    return lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'GetQueryResults' }),
    }).then((response: GetMetricFlowQueryBase64ResultsResponse) => {
        return {
            ...response,
            query: {
                ...response.query,
                jsonResult: response.query.jsonResult
                    ? JSON.parse(atob(response.query.jsonResult))
                    : null,
            },
        } as GetMetricFlowQueryResultsResponse;
    });
}
