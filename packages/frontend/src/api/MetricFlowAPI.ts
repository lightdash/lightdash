import {
    isAndFilterGroup,
    isFilterGroup,
    type FieldValueSearchResult,
    type FilterGroup,
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
        url: `/projects/${projectUuid}/metricflow/dimension-values`,
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
    return lightdashApi<GetMetricFlowFieldsResponse>({
        url: `/projects/${projectUuid}/metricflow/fields`,
        method: 'POST',
        body: JSON.stringify({
            metrics: Object.keys(metrics ?? {}),
        }),
    });
}

export function getSemanticLayerMetrics(
    projectUuid: string,
    dimensions: Record<string, { grain?: TimeGranularity }>,
): Promise<GetSemanticLayerMetricsResponse> {
    return lightdashApi<GetSemanticLayerMetricsResponse>({
        url: `/projects/${projectUuid}/metricflow/fields`,
        method: 'POST',
        body: JSON.stringify({
            dimensions: Object.entries(dimensions ?? {}).map(
                ([dimension, options]) => ({
                    name: dimension,
                    grain: options.grain,
                }),
            ),
        }),
    });
}

export type CreateMetricFlowQueryResponse = {
    createQuery: {
        queryId: string;
    };
};

export async function getMetricDefinition(
    projectUuid: string,
    metricName: string,
): Promise<MetricDefinition | null> {
    return lightdashApi<MetricDefinition | null>({
        url: `/projects/${projectUuid}/metricflow/metrics/${encodeURIComponent(
            metricName,
        )}/definition`,
        method: 'GET',
        body: undefined,
    });
}

export async function getMetricLineage(
    projectUuid: string,
    metricName: string,
): Promise<MetricLineage | null> {
    return lightdashApi<MetricLineage | null>({
        url: `/projects/${projectUuid}/metricflow/metrics/${encodeURIComponent(
            metricName,
        )}/lineage`,
        method: 'GET',
        body: undefined,
    });
}

export function createMetricFlowQuery(
    projectUuid: string,
    data: {
        metrics: Record<string, {}>;
        dimensions: Record<string, { grain?: TimeGranularity }>;
        filters?: Filters;
        orderBy?: MetricFlowOrderBy[];
        limit?: number;
    },
): Promise<CreateMetricFlowQueryResponse> {
    const mapFilterGroup = (group: FilterGroup) => {
        const items = isAndFilterGroup(group) ? group.and : group.or;
        const key = isAndFilterGroup(group) ? 'and' : 'or';
        return {
            id: group.id,
            [key]: items.map((item) =>
                isFilterGroup(item)
                    ? { group: mapFilterGroup(item) }
                    : { rule: item },
            ),
        };
    };

    const mapFilters = (filters?: Filters) => {
        if (!filters) return undefined;
        return {
            dimensions: filters.dimensions
                ? mapFilterGroup(filters.dimensions)
                : undefined,
            metrics: filters.metrics
                ? mapFilterGroup(filters.metrics)
                : undefined,
            tableCalculations: filters.tableCalculations
                ? mapFilterGroup(filters.tableCalculations)
                : undefined,
        };
    };

    return lightdashApi<any>({
        url: `/projects/${projectUuid}/metricflow/queries`,
        method: 'POST',
        body: JSON.stringify({
            metrics: Object.keys(data?.metrics ?? {}).map((name) => ({ name })),
            groupBy: Object.entries(data.dimensions ?? {}).map(
                ([dimension, options]) => ({
                    name: dimension,
                    grain: options.grain,
                }),
            ),
            filters: mapFilters(data.filters),
            orderBy:
                data.orderBy?.map((orderBy) => {
                    if (orderBy.type === 'metric') {
                        return {
                            metric: { name: orderBy.name },
                            descending: orderBy.descending,
                        };
                    }
                    return {
                        groupBy: {
                            name: orderBy.name,
                            grain: orderBy.grain,
                        },
                        descending: orderBy.descending,
                    };
                }) ?? [],
            limit: data.limit,
        }),
    });
}

export enum QueryStatus

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
    return lightdashApi<GetMetricFlowQueryResultsResponse>({
        url: `/projects/${projectUuid}/metricflow/queries/${queryId}`,
        method: 'GET',
        body: undefined,
    });
}
