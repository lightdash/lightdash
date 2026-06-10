import {
    ContentAsCodeType,
    currentVersion,
    type ChartAsCode,
} from '../../types/coder';
import { normalizeFilterIds } from '../../utils/filters';
import { generateSlug } from '../../utils/slugs';
import { AI_DEFAULT_MAX_QUERY_LIMIT } from './constants';
import { type AiMetricQueryWithFilters } from './types';
import { getValidAiQueryLimit } from './validators';

export const isChartAsCodeArtifactConfig = (
    vizConfigUnknown: object | null,
): vizConfigUnknown is ChartAsCode => {
    if (!vizConfigUnknown || typeof vizConfigUnknown !== 'object') {
        return false;
    }

    const { contentType, tableName, metricQuery, chartConfig } =
        vizConfigUnknown as Partial<ChartAsCode>;
    return (
        contentType === ContentAsCodeType.CHART &&
        typeof tableName === 'string' &&
        !!metricQuery &&
        typeof metricQuery === 'object' &&
        !!chartConfig &&
        typeof chartConfig === 'object' &&
        typeof chartConfig.type === 'string'
    );
};

export type ChartAsCodeMetricQueryInput = Partial<ChartAsCode['metricQuery']>;

export const normalizeChartAsCodeMetricQuery = (
    tableName: string,
    metricQuery: ChartAsCodeMetricQueryInput,
    maxLimit?: number,
): AiMetricQueryWithFilters => ({
    ...metricQuery,
    exploreName: metricQuery.exploreName ?? tableName,
    dimensions: metricQuery.dimensions ?? [],
    metrics: metricQuery.metrics ?? [],
    sorts: metricQuery.sorts ?? [],
    limit: getValidAiQueryLimit(
        metricQuery.limit ?? null,
        maxLimit ?? AI_DEFAULT_MAX_QUERY_LIMIT,
    ),
    filters: normalizeFilterIds(metricQuery.filters),
    additionalMetrics: metricQuery.additionalMetrics ?? [],
    tableCalculations: metricQuery.tableCalculations ?? [],
});

export const getChartAsCodeMetricQuery = (
    chartAsCode: ChartAsCode,
    maxLimit?: number,
): AiMetricQueryWithFilters =>
    normalizeChartAsCodeMetricQuery(
        chartAsCode.tableName,
        chartAsCode.metricQuery,
        maxLimit,
    );

type BuildChartAsCodeArtifactArgs = {
    name: string;
    description?: string | null;
    tableName: string;
    metricQuery: ChartAsCodeMetricQueryInput;
    chartConfig: ChartAsCode['chartConfig'];
    pivotConfig?: ChartAsCode['pivotConfig'] | null;
    tableConfig?: ChartAsCode['tableConfig'] | null;
    maxLimit?: number;
    spaceSlug?: string;
};

const getTableConfig = (
    tableConfig: ChartAsCode['tableConfig'] | null | undefined,
    metricQuery: AiMetricQueryWithFilters,
): ChartAsCode['tableConfig'] => {
    if (tableConfig) {
        return tableConfig;
    }

    return {
        columnOrder: [
            ...metricQuery.dimensions,
            ...metricQuery.metrics,
            ...metricQuery.tableCalculations.map(
                (calculation) => calculation.name,
            ),
        ],
    };
};

export const buildChartAsCodeArtifact = ({
    name,
    description,
    tableName,
    metricQuery,
    chartConfig,
    pivotConfig,
    tableConfig,
    maxLimit,
    spaceSlug = 'agent-suggestions',
}: BuildChartAsCodeArtifactArgs): ChartAsCode => {
    const normalizedMetricQuery = normalizeChartAsCodeMetricQuery(
        tableName,
        metricQuery,
        maxLimit,
    );
    // The artifact keeps the input additionalMetrics (with their `sql`) as-is;
    // execution paths re-derive that SQL server-side via populateCustomMetricsSQL.
    const artifactMetricQuery: ChartAsCode['metricQuery'] = {
        ...metricQuery,
        ...normalizedMetricQuery,
        additionalMetrics: metricQuery.additionalMetrics ?? [],
    };

    return {
        name,
        ...(description ? { description } : {}),
        tableName: normalizedMetricQuery.exploreName,
        metricQuery: artifactMetricQuery,
        chartConfig,
        ...(pivotConfig ? { pivotConfig } : {}),
        tableConfig: getTableConfig(tableConfig, normalizedMetricQuery),
        slug: generateSlug(name),
        spaceSlug,
        dashboardSlug: undefined,
        version: currentVersion,
        contentType: ContentAsCodeType.CHART,
    };
};
