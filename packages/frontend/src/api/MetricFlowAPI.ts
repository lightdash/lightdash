import { type FieldValueSearchResult } from '@lightdash/common';
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

export enum TimeGranularity {
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    QUARTER = 'QUARTER',
    YEAR = 'YEAR',
}

export type MetricFlowOrderBy =
    | {
          type: 'metric';
          name: string;
          descending: boolean;
      }
    | {
          type: 'groupBy';
          name: string;
          grain?: TimeGranularity;
          descending: boolean;
      };

export type MetricFlowDimensionValuesRequest = {
    dimension: string;
    metrics?: string[];
    search?: string;
    limit?: number;
};

export function getMetricFlowDimensionValues(
    projectUuid: string,
    data: MetricFlowDimensionValuesRequest,
): Promise<FieldValueSearchResult<string>> {
    return lightdashApi<FieldValueSearchResult<string>>({
        url: `/projects/${projectUuid}/dbtsemanticlayer/dimension-values`,
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export type GetMetricFlowFieldsResponse = {
    dimensions: Array<{
        name: string;
        description?: string;
        type: MetricFlowDimensionType;
        queryableGranularities: TimeGranularity[];
    }>;
    metricsForDimensions: Array<{
        name: string;
        description?: string;
        type: MetricFlowMetricType;
        dimensions: Array<{
            name: string;
            description?: string;
            type: MetricFlowDimensionType;
            queryableGranularities: TimeGranularity[];
        }>;
    }>;
};

export type GetSemanticLayerMetricsResponse = {
    metricsForDimensions: Array<{
        name: string;
        description?: string;
        type: MetricFlowMetricType;
        dimensions: Array<{
            name: string;
            description?: string;
            type: MetricFlowDimensionType;
            queryableGranularities: TimeGranularity[];
        }>;
    }>;
};

export function getSemanticLayerDimensions(
    projectUuid: string,
    metrics: Record<string, {}>,
): Promise<GetMetricFlowFieldsResponse> {
    const query = `query GetFields($environmentId: BigInt!) {
            metricsForDimensions(environmentId: $environmentId, dimensions: []) {
                name
                description
                type
                dimensions {
                  name
                  description
                  type
                  queryableGranularities
                } 
            }
            dimensions(environmentId: $environmentId, metrics: [${
                Object.entries(metrics).map(
                    ([metric]) => `{ name: "${metric}" }`,
                ) ?? ''
            }]) {
                name
                description
                type
                queryableGranularities
            }
        }`;

    return lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'GetFields' }),
    });
}

export function getSemanticLayerMetrics(
    projectUuid: string,
    dimensions: Record<string, { grain?: TimeGranularity }>,
): Promise<GetSemanticLayerMetricsResponse> {
    const query = `query GetFields($environmentId: BigInt!) {
            metricsForDimensions(environmentId: $environmentId, dimensions: [${
                Object.entries(dimensions)
                    .filter(([dimension]) => dimension !== 'metric_time') // TODO: remove this when dbt stops throwing error when filtering by "metric_time"
                    .map(([dimension, options]) => {
                        const grainPart = options.grain
                            ? `, grain: ${options.grain}`
                            : '';
                        return `{ name: "${dimension}"${grainPart} }`;
                    }) ?? ''
            }]) {
                name
                description
                type
                dimensions {
                  name
                  description
                  type
                  queryableGranularities
                } 
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
        metrics: Record<string, {}>;
        dimensions: Record<string, { grain?: TimeGranularity }>;
        where?: string[];
        orderBy?: MetricFlowOrderBy[];
    },
): Promise<CreateMetricFlowQueryResponse> {
    const whereString =
        data.where?.map((sql) => `{ sql: ${JSON.stringify(sql)} }`) ?? [];
    const orderByString =
        data.orderBy?.map((orderBy) => {
            if (orderBy.type === 'metric') {
                return `{ metric: { name: "${orderBy.name}" }, descending: ${orderBy.descending} }`;
            }
            const grainPart = orderBy.grain ? `, grain: ${orderBy.grain}` : '';
            return `{ groupBy: { name: "${orderBy.name}"${grainPart} }, descending: ${orderBy.descending} }`;
        }) ?? [];
    const query: string = `
            mutation CreateQuery($environmentId: BigInt!) {
              createQuery(
                environmentId: $environmentId
                metrics: [${Object.entries(data?.metrics).map(
                    ([metric]) => `{ name: "${metric}" }`,
                )}]
                groupBy: [${Object.entries(data.dimensions ?? {}).map(
                    ([dimension, options]) => {
                        const grainPart = options.grain
                            ? `, grain: ${options.grain}`
                            : '';
                        return `{ name: "${dimension}"${grainPart} }`;
                    },
                )}]
                where: [${whereString}]
                orderBy: [${orderByString}]
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
        let jsonResult: MetricFlowJsonResults | null = null;
        if (response.query.jsonResult) {
            try {
                const decoded =
                    typeof TextDecoder === 'undefined'
                        ? decodeURIComponent(
                              escape(atob(response.query.jsonResult)),
                          )
                        : new TextDecoder('utf-8').decode(
                              Uint8Array.from(
                                  atob(response.query.jsonResult),
                                  (char) => char.charCodeAt(0),
                              ),
                          );
                jsonResult = JSON.parse(decoded) as MetricFlowJsonResults;
            } catch (error) {
                console.warn('Failed to parse MetricFlow query results', error);
            }
        }

        return {
            ...response,
            query: {
                ...response.query,
                jsonResult,
            },
        } as GetMetricFlowQueryResultsResponse;
    });
}
