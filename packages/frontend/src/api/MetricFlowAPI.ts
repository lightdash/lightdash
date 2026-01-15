import {
    isAndFilterGroup,
    isFilterGroup,
    isFilterRule,
    type FieldValueSearchResult,
    type FilterGroup,
    type FilterGroupItem,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { lightdashApi } from '../api';

export enum MetricFlowDimensionType

export enum MetricFlowMetricType

export enum TimeGranularity

export type MetricFlowSemanticModel = {
    name: string;
    label?: string | null;
    description?: string | null;
};

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
        label?: string | null;
        description?: string;
        type: MetricFlowDimensionType;
        queryableGranularities: TimeGranularity[];
        semanticModel?: MetricFlowSemanticModel | null;
    }>;
    metricsForDimensions: Array<{
        name: string;
        label?: string | null;
        description?: string;
        type: MetricFlowMetricType;
        semanticModels?: MetricFlowSemanticModel[] | null;
        dimensions: Array<{
            name: string;
            label?: string | null;
            description?: string;
            type: MetricFlowDimensionType;
            queryableGranularities: TimeGranularity[];
            semanticModel?: MetricFlowSemanticModel | null;
        }>;
    }>;
};

export type GetSemanticLayerMetricsResponse = {
    metricsForDimensions: Array<{
        name: string;
        label?: string | null;
        description?: string;
        type: MetricFlowMetricType;
        semanticModels?: MetricFlowSemanticModel[] | null;
        dimensions: Array<{
            name: string;
            label?: string | null;
            description?: string;
            type: MetricFlowDimensionType;
            queryableGranularities: TimeGranularity[];
            semanticModel?: MetricFlowSemanticModel | null;
        }>;
    }>;
};

export type MetricDefinitionFilter = {
    dimension: string;
    operator: string;
    values?: Array<string | number | boolean | null>;
};

export type MetricDefinition = {
    name: string;
    label?: string | null;
    description?: string | null;
    type?: MetricFlowMetricType | string;
    formulaDisplay?: string | null;
    filterRaw?: string | null;
    filterStructured?: MetricDefinitionFilter[];
    filters?: MetricDefinitionFilter[];
    inputs?: {
        inputMetrics?: Array<{
            name: string;
            label?: string | null;
            filterRaw?: string | null;
            filterStructured?: MetricDefinitionFilter[];
        }>;
        inputMeasures?: Array<{
            name: string;
            label?: string | null;
            agg?: string | null;
            expr?: string | null;
            filterRaw?: string | null;
        }>;
    };
    dimensions?: Array<{
        name: string;
        label?: string | null;
    }>;
    semanticModels?: Array<{
        name: string;
        label?: string | null;
        description?: string | null;
    }>;
};

export type MetricLineageNode = {
    id: string;
    type: string;
    label?: string | null;
    name?: string | null;
    description?: string | null;
    metricType?: string | null;
    formulaDisplay?: string | null;
    filterRaw?: string | null;
    filterStructured?: MetricDefinitionFilter[] | null;
    agg?: string | null;
    expr?: string | null;
    identifier?: string | null;
    alias?: string | null;
    semanticModel?: string | null;
    relationType?: string | null;
    resourceType?: string | null;
    schema?: string | null;
    database?: string | null;
};

export type MetricLineageEdge = {
    from: string;
    to: string;
    type?: string | null;
};

export type MetricLineage = {
    metricDefinition?: MetricDefinition;
    lineage?: {
        nodes: MetricLineageNode[];
        edges: MetricLineageEdge[];
    };
};

export function getSemanticLayerDimensions(
    projectUuid: string,
    metrics: Record<string, {}>,
): Promise<GetMetricFlowFieldsResponse> {
    const query = `query GetFields($environmentId: BigInt!) {
            metricsForDimensions(environmentId: $environmentId, dimensions: []) {
                name
                description
                label
                type
                semanticModels {
                  name
                  label
                  description
                }
                dimensions {
                  name
                  description
                  label
                  type
                  queryableGranularities
                  semanticModel {
                    name
                    label
                    description
                  }
                } 
            }
            dimensions(environmentId: $environmentId, metrics: [${
                Object.entries(metrics).map(
                    ([metric]) => `{ name: "${metric}" }`,
                ) ?? ''
            }]) {
                name
                description
                label
                type
                queryableGranularities
                semanticModel {
                  name
                  label
                  description
                }
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
                label
                type
                semanticModels {
                  name
                  label
                  description
                }
                dimensions {
                  name
                  description
                  label
                  type
                  queryableGranularities
                  semanticModel {
                    name
                    label
                    description
                  }
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

const escapeGraphqlString = (value: string) =>
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const parseGraphqlJsonScalar = <T>(value: unknown): T | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch (error) {
            console.warn('Failed to parse MetricFlow JSON scalar', error);
            return null;
        }
    }
    return value as T;
};

export async function getMetricDefinition(
    projectUuid: string,
    metricName: string,
): Promise<MetricDefinition | null> {
    const query = `query GetMetricDefinition($environmentId: BigInt!) {
            metricDefinition(environmentId: $environmentId, metricName: "${escapeGraphqlString(
                metricName,
            )}")
        }`;

    const results = await lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'GetMetricDefinition' }),
    });

    return parseGraphqlJsonScalar<MetricDefinition>(results?.metricDefinition);
}

export async function getMetricLineage(
    projectUuid: string,
    metricName: string,
): Promise<MetricLineage | null> {
    const query = `query GetMetricLineage($environmentId: BigInt!) {
            metricLineage(environmentId: $environmentId, metricName: "${escapeGraphqlString(
                metricName,
            )}")
        }`;

    const results = await lightdashApi<any>({
        url: `/projects/${projectUuid}/dbtsemanticlayer`,
        method: 'POST',
        body: JSON.stringify({ query, operationName: 'GetMetricLineage' }),
    });

    return parseGraphqlJsonScalar<MetricLineage>(results?.metricLineage);
}

const serializeGraphqlValue = (value: unknown): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'null';
    if (typeof value === 'string') {
        return `"${escapeGraphqlString(value)}"`;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return `${value}`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(serializeGraphqlValue).join(', ')}]`;
    }
    return `"${escapeGraphqlString(JSON.stringify(value))}"`;
};

const serializeFilterRuleInput = (rule: FilterRule): string => {
    const parts = [
        `id: "${escapeGraphqlString(rule.id)}"`,
        `target: { fieldId: "${escapeGraphqlString(rule.target.fieldId)}" }`,
        `operator: "${escapeGraphqlString(rule.operator)}"`,
    ];

    if (rule.values !== undefined) {
        parts.push(`values: ${serializeGraphqlValue(rule.values)}`);
    }
    if (rule.settings) {
        const settingsParts: string[] = [];
        if (rule.settings.unitOfTime) {
            settingsParts.push(
                `unitOfTime: "${escapeGraphqlString(
                    rule.settings.unitOfTime,
                )}"`,
            );
        }
        if (rule.settings.completed !== undefined) {
            settingsParts.push(`completed: ${rule.settings.completed}`);
        }
        if (settingsParts.length > 0) {
            parts.push(`settings: { ${settingsParts.join(', ')} }`);
        }
    }
    if (rule.disabled !== undefined) {
        parts.push(`disabled: ${rule.disabled}`);
    }

    return `{ ${parts.join(', ')} }`;
};

function serializeFilterGroupInput(group: FilterGroup): string {
    const serializeFilterGroupItemInput = (item: FilterGroupItem): string => {
        if (isFilterGroup(item)) {
            return `{ group: ${serializeFilterGroupInput(item)} }`;
        }
        if (isFilterRule(item)) {
            return `{ rule: ${serializeFilterRuleInput(item)} }`;
        }
        return '';
    };

    const items = isAndFilterGroup(group) ? group.and : group.or;
    const joinKey = isAndFilterGroup(group) ? 'and' : 'or';
    const serializedItems = items
        .map(serializeFilterGroupItemInput)
        .filter((value) => value.length > 0)
        .join(', ');

    return `{ id: "${escapeGraphqlString(
        group.id,
    )}", ${joinKey}: [${serializedItems}] }`;
}

const serializeFiltersInput = (filters?: Filters): string => {
    if (!filters) return '{}';
    const parts: string[] = [];
    if (filters.dimensions) {
        parts.push(
            `dimensions: ${serializeFilterGroupInput(filters.dimensions)}`,
        );
    }
    if (filters.metrics) {
        parts.push(`metrics: ${serializeFilterGroupInput(filters.metrics)}`);
    }
    if (filters.tableCalculations) {
        parts.push(
            `tableCalculations: ${serializeFilterGroupInput(
                filters.tableCalculations,
            )}`,
        );
    }
    return parts.length > 0 ? `{ ${parts.join(', ')} }` : '{}';
};

export function createMetricFlowQuery(
    projectUuid: string,
    data: {
        metrics: Record<string, {}>;
        dimensions: Record<string, { grain?: TimeGranularity }>;
        filters?: Filters;
        orderBy?: MetricFlowOrderBy[];
    },
): Promise<CreateMetricFlowQueryResponse> {
    const filtersInput = serializeFiltersInput(data.filters);
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
                filters: ${filtersInput}
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

export enum QueryStatus

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
